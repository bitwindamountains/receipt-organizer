package app.snapsort.mobile;

import android.content.Context;
import android.content.SharedPreferences;
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

    static void setEnabled(Context context, boolean enabled) {
        SharedPreferences.Editor editor = prefs(context).edit().putBoolean(KEY_ENABLED, enabled);
        // Turning capture off also discards anything waiting to be imported.
        if (!enabled) editor.putString(KEY_QUEUE, "[]");
        editor.apply();
    }

    static synchronized void append(Context context, JSONObject entry) {
        JSONArray queue = read(context);
        queue.put(entry);
        JSONArray trimmed = new JSONArray();
        for (int i = Math.max(0, queue.length() - MAX_QUEUED); i < queue.length(); i++) {
            trimmed.put(queue.opt(i));
        }
        prefs(context).edit().putString(KEY_QUEUE, trimmed.toString()).apply();
    }

    static synchronized JSONArray takeAll(Context context) {
        JSONArray queue = read(context);
        prefs(context).edit().putString(KEY_QUEUE, "[]").apply();
        return queue;
    }

    private static JSONArray read(Context context) {
        try {
            return new JSONArray(prefs(context).getString(KEY_QUEUE, "[]"));
        } catch (JSONException error) {
            return new JSONArray();
        }
    }
}
