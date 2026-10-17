package app.snapsort.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * On-device queue of captured payment notifications, so payments that arrive
 * while SnapSort is closed are imported the next time it opens. Holds only
 * notifications that already passed the service's payment filter.
 */
final class CaptureStore {

    private static final String PREFS = "snapsort_capture";
    private static final String KEY_QUEUE = "queue";
    private static final String KEY_ENABLED = "enabled";
    private static final int MAX_QUEUED = 200;

    private CaptureStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean isEnabled(Context context) {
        return prefs(context).getBoolean(KEY_ENABLED, false);
    }

    // synchronized with append, so an append in flight cannot write the old queue back after a clear.
    static synchronized void setEnabled(Context context, boolean enabled) {
        SharedPreferences.Editor editor = prefs(context).edit().putBoolean(KEY_ENABLED, enabled);
        // Turning capture off also discards anything waiting to be imported.
        if (!enabled) editor.putString(KEY_QUEUE, "[]");
        editor.apply();
    }

    /** Returns false when capture was turned off after the service checked, so nothing was queued. */
    static synchronized boolean append(Context context, JSONObject entry) {
        if (!isEnabled(context)) return false;
        JSONArray queue = read(context);
        queue.put(entry);
        JSONArray trimmed = new JSONArray();
        for (int i = Math.max(0, queue.length() - MAX_QUEUED); i < queue.length(); i++) {
            trimmed.put(queue.opt(i));
        }
        prefs(context).edit().putString(KEY_QUEUE, trimmed.toString()).apply();
        return true;
    }

    /** Reads the queue without clearing it; entries stay until {@link #remove} confirms they were filed. */
    static synchronized JSONArray peek(Context context) {
        return read(context);
    }

    static synchronized void remove(Context context, Set<String> ids) {
        JSONArray queue = read(context);
        JSONArray kept = new JSONArray();
        for (int i = 0; i < queue.length(); i++) {
            JSONObject entry = queue.optJSONObject(i);
            if (entry != null && !ids.contains(entry.optString("id"))) kept.put(entry);
        }
        prefs(context).edit().putString(KEY_QUEUE, kept.toString()).apply();
    }

    private static JSONArray read(Context context) {
        try {
            return new JSONArray(prefs(context).getString(KEY_QUEUE, "[]"));
        } catch (JSONException error) {
            return new JSONArray();
        }
    }
}
