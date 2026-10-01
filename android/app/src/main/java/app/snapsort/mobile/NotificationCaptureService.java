package app.snapsort.mobile;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Pattern;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Receives notifications once the user grants SnapSort "Notification access".
 * Only notifications that look like a completed payment (a peso amount plus a
 * payment word) are kept; everything else is ignored and never stored. Chat
 * and SMS apps are skipped entirely so personal messages are never read into
 * the app. Parsing into transactions happens in the web layer
 * (core/capture/transaction-parser.ts).
 */
public class NotificationCaptureService extends NotificationListenerService {

    // ₱ is the peso sign; "P 500.00" covers printers and apps without it.
    private static final Pattern AMOUNT = Pattern.compile("(₱|PHP|Php|\\bP(?=\\s?\\d))\\s?\\d");
    private static final Pattern PAYMENT_WORDS = Pattern.compile(
        "(?i)\\b(sent|paid|payment|purchase|debited|credited|received|transferred|cash[- ]?in|cash[- ]?out|withdraw|deposit|refund)"
    );

    private static final Set<String> IGNORED_PACKAGES = new HashSet<>(
        Arrays.asList(
            "com.facebook.orca",
            "com.facebook.katana",
            "com.facebook.mlite",
            "com.whatsapp",
            "com.viber.voip",
            "org.telegram.messenger",
            "com.google.android.apps.messaging",
            "com.samsung.android.messaging",
            "com.android.mms",
            "com.instagram.android",
            "com.discord",
            "jp.naver.line.android"
        )
    );

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (!CaptureStore.isEnabled(this)) return;
        String packageName = sbn.getPackageName();
        if (getPackageName().equals(packageName) || IGNORED_PACKAGES.contains(packageName)) return;

        Notification notification = sbn.getNotification();
        if (notification == null || (notification.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
        Bundle extras = notification.extras;
        if (extras == null) return;

        String title = text(extras.getCharSequence(Notification.EXTRA_TITLE));
        CharSequence big = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
        String body = text(big != null ? big : extras.getCharSequence(Notification.EXTRA_TEXT));
        String combined = title + " " + body;
        if (!AMOUNT.matcher(combined).find() || !PAYMENT_WORDS.matcher(combined).find()) return;

        try {
            JSONObject entry = new JSONObject();
            entry.put("id", sbn.getKey() + ":" + sbn.getPostTime());
            entry.put("packageName", packageName);
            entry.put("title", title);
            entry.put("text", body);
            entry.put("postedAt", sbn.getPostTime());
            CaptureStore.append(this, entry);
            SnapSortCapturePlugin.onNotificationCaptured(entry);
        } catch (JSONException ignored) {
            // A malformed entry is dropped; the next notification is unaffected.
        }
    }

    private static String text(CharSequence value) {
        return value == null ? "" : value.toString();
    }
}
