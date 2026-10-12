package app.snapsort.mobile;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Intent;
import android.content.pm.ProviderInfo;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.provider.Settings;
import android.webkit.MimeTypeMap;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.IntentCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Native side of SnapSort's automatic capture:
 * - payment notifications (NotificationCaptureService + CaptureStore),
 * - recent screenshots for the screenshot inbox (MediaStore, read-only),
 * - images shared into SnapSort from other apps (ACTION_SEND / SEND_MULTIPLE).
 * The web layer (core/capture) parses and files everything.
 */
@CapacitorPlugin(
    name = "SnapSortCapture",
    permissions = {
        @Permission(alias = SnapSortCapturePlugin.PHOTOS, strings = { Manifest.permission.READ_MEDIA_IMAGES }),
        @Permission(alias = SnapSortCapturePlugin.LEGACY_PHOTOS, strings = { Manifest.permission.READ_EXTERNAL_STORAGE }),
    }
)
public class SnapSortCapturePlugin extends Plugin {

    static final String PHOTOS = "photos";
    static final String LEGACY_PHOTOS = "legacyPhotos";
    private static final int MAX_SCREENSHOTS = 20;
    // Phone photos and screenshots are well under this; anything bigger is not a receipt image.
    private static final long MAX_SHARED_BYTES = 25L * 1024 * 1024;

    private static SnapSortCapturePlugin instance;
    private final List<JSObject> pendingShares = new ArrayList<>();

    @Override
    public void load() {
        instance = this;
        if (getActivity() != null) handleShareIntent(getActivity().getIntent());
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        handleShareIntent(intent);
    }

    // ---------- Payment notifications ----------

    /** Called by the listener service; forwards a capture to the app when it is open. */
    static void onNotificationCaptured(JSONObject entry) {
        SnapSortCapturePlugin plugin = instance;
        if (plugin == null || plugin.getBridge() == null) return;
        plugin.getBridge().executeOnMainThread(() -> {
            try {
                plugin.notifyListeners("notificationCaptured", JSObject.fromJSONObject(entry));
            } catch (JSONException ignored) {
                // Still queued in CaptureStore; it is imported on the next drain.
            }
        });
    }

    @PluginMethod
    public void getCaptureStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("accessGranted", NotificationManagerCompat.getEnabledListenerPackages(getContext()).contains(getContext().getPackageName()));
        result.put("enabled", CaptureStore.isEnabled(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void setCaptureEnabled(PluginCall call) {
        CaptureStore.setEnabled(getContext(), call.getBoolean("enabled", false));
        call.resolve();
    }

    @PluginMethod
    public void openNotificationAccessSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void getCapturedNotifications(PluginCall call) {
        JSONArray queued = CaptureStore.peek(getContext());
        try {
            JSObject result = new JSObject();
            result.put("notifications", new JSArray(queued.toString()));
            call.resolve(result);
        } catch (JSONException error) {
            call.reject("Could not read captured notifications.", error);
        }
    }

    /** Removes queued notifications the app has filed (or deliberately skipped). */
    @PluginMethod
    public void ackCapturedNotifications(PluginCall call) {
        JSArray ids = call.getArray("ids", new JSArray());
        Set<String> handled = new HashSet<>();
        for (int i = 0; i < ids.length(); i++) handled.add(ids.optString(i));
        CaptureStore.remove(getContext(), handled);
        call.resolve();
    }

    // ---------- Screenshot inbox ----------

    private String photosAlias() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ? PHOTOS : LEGACY_PHOTOS;
    }

    @PluginMethod
    public void getPhotosPermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("state", getPermissionState(photosAlias()).toString());
        call.resolve(result);
    }

    @PluginMethod
    public void requestPhotosPermission(PluginCall call) {
        if (getPermissionState(photosAlias()) == PermissionState.GRANTED) {
            getPhotosPermission(call);
            return;
        }
        requestPermissionForAlias(photosAlias(), call, "photosPermissionCallback");
    }

    @PermissionCallback
    private void photosPermissionCallback(PluginCall call) {
        getPhotosPermission(call);
    }

    /**
     * Screenshots added after `since` (epoch ms), oldest first, so the caller can page forward
     * without skipping any. Read-only; nothing is copied.
     */
    @PluginMethod
    public void getRecentScreenshots(PluginCall call) {
        if (getPermissionState(photosAlias()) != PermissionState.GRANTED) {
            call.reject("Photo access is not granted.", "PERMISSION_DENIED");
            return;
        }
        long sinceSeconds = (long) (call.getDouble("since", 0d) / 1000d);
        int limit = Math.min(call.getInt("limit", MAX_SCREENSHOTS), MAX_SCREENSHOTS);
        Uri collection = MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
        String[] projection = {
            MediaStore.Images.Media._ID,
            MediaStore.Images.Media.DISPLAY_NAME,
            MediaStore.Images.Media.DATE_ADDED,
            MediaStore.Images.Media.MIME_TYPE,
        };
        String selection =
            MediaStore.Images.Media.DATE_ADDED +
            " > ? AND (" +
            MediaStore.Images.ImageColumns.BUCKET_DISPLAY_NAME +
            " LIKE ? OR " +
            MediaStore.Images.Media.DISPLAY_NAME +
            " LIKE ?)";
        String[] args = { String.valueOf(sinceSeconds), "%Screenshot%", "Screenshot%" };
        JSArray screenshots = new JSArray();
        try (
            Cursor cursor = getContext()
                .getContentResolver()
                .query(collection, projection, selection, args, MediaStore.Images.Media.DATE_ADDED + " ASC")
        ) {
            if (cursor != null) {
                int idColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID);
                int nameColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME);
                int addedColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED);
                int mimeColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.MIME_TYPE);
                while (cursor.moveToNext() && screenshots.length() < limit) {
                    JSObject shot = new JSObject();
                    shot.put("uri", ContentUris.withAppendedId(collection, cursor.getLong(idColumn)).toString());
                    shot.put("fileName", cursor.getString(nameColumn));
                    shot.put("takenAt", cursor.getLong(addedColumn) * 1000L);
                    shot.put("mimeType", cursor.getString(mimeColumn));
                    screenshots.put(shot);
                }
            }
        } catch (RuntimeException error) {
            call.reject("Could not read screenshots.", error);
            return;
        }
        JSObject result = new JSObject();
        result.put("screenshots", screenshots);
        call.resolve(result);
    }

    // ---------- Share into SnapSort ----------

    @PluginMethod
    public void takeSharedImages(PluginCall call) {
        JSArray images = new JSArray();
        synchronized (pendingShares) {
            for (JSObject image : pendingShares) images.put(image);
            pendingShares.clear();
        }
        JSObject result = new JSObject();
        result.put("images", images);
        call.resolve(result);
    }

    /**
     * Copies shared images into the app cache right away: the read grant on a
     * shared content:// URI can end with the sending app, a private copy cannot.
     */
    private void handleShareIntent(Intent intent) {
        if (intent == null || intent.getType() == null || !intent.getType().startsWith("image/")) return;
        List<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            Uri uri = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri.class);
            if (uri != null) uris.add(uri);
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction())) {
            ArrayList<Uri> many = IntentCompat.getParcelableArrayListExtra(intent, Intent.EXTRA_STREAM, Uri.class);
            if (many != null) uris.addAll(many);
        } else {
            return;
        }
        // Handle each share once, even if the activity is recreated with the same intent.
        intent.setAction(null);

        // Copying can download from a cloud provider; off the UI thread so the app never freezes (ANR).
        List<Uri> batch = new ArrayList<>(uris.subList(0, Math.min(uris.size(), 10)));
        getBridge().execute(() -> {
            int copied = 0;
            for (Uri uri : batch) {
                JSObject image = copyToCache(uri);
                if (image == null) continue;
                synchronized (pendingShares) {
                    pendingShares.add(image);
                }
                copied++;
            }
            if (copied > 0) {
                JSObject event = new JSObject();
                event.put("count", copied);
                notifyListeners("imagesShared", event, true);
            }
        });
    }

    /**
     * Only images another app serves through a content provider are accepted. A file:// URI or one of
     * SnapSort's own providers would otherwise be read with SnapSort's permissions, letting another app
     * pull SnapSort's private files (database, captured notifications) into the library.
     */
    private boolean isForeignImage(Uri uri, String mimeType) {
        if (!ContentResolver.SCHEME_CONTENT.equals(uri.getScheme()) || uri.getAuthority() == null) return false;
        if (mimeType == null || !mimeType.startsWith("image/")) return false;
        ProviderInfo provider = getContext().getPackageManager().resolveContentProvider(uri.getAuthority(), 0);
        return provider == null || !getContext().getPackageName().equals(provider.packageName);
    }

    private JSObject copyToCache(Uri uri) {
        ContentResolver resolver = getContext().getContentResolver();
        String mimeType = resolver.getType(uri);
        if (!isForeignImage(uri, mimeType)) return null;
        String extension = MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType);
        if (extension == null) extension = "jpg";
        File directory = new File(getContext().getCacheDir(), "shared");
        if (!directory.exists() && !directory.mkdirs()) return null;
        File target = new File(directory, UUID.randomUUID() + "." + extension);
        try (InputStream input = resolver.openInputStream(uri); OutputStream output = new FileOutputStream(target)) {
            if (input == null) return null;
            byte[] buffer = new byte[64 * 1024];
            long total = 0;
            int read;
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (total > MAX_SHARED_BYTES) throw new IOException("Shared image is too large.");
                output.write(buffer, 0, read);
            }
        } catch (Exception error) {
            //noinspection ResultOfMethodCallIgnored
            target.delete();
            return null;
        }
        JSObject image = new JSObject();
        image.put("fileUri", Uri.fromFile(target).toString());
        image.put("mimeType", mimeType);
        image.put("fileName", uri.getLastPathSegment());
        return image;
    }
}
