package com.belobaka.iptv;

import android.content.pm.ActivityInfo;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Minimal screen-orientation control for BELOBAKA IPTV playback.
 *
 * A viewer watching full-screen video on a phone expects the picture to turn
 * with the content, so the web player asks the activity for landscape while a
 * stream plays and hands orientation back when it stops. The official
 * `@capacitor/screen-orientation` plugin would also do this, but the app
 * already ships a local plugin and a two-method one keeps the APK free of
 * another dependency.
 */
@CapacitorPlugin(name = "ScreenOrientation")
public class ScreenOrientationPlugin extends Plugin {

    /** Landscape in both directions, so a phone can be held either way. */
    @PluginMethod
    public void lockLandscape(PluginCall call) {
        getActivity()
            .setRequestedOrientation(
                ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
            );
        call.resolve();
    }

    /** Back to the device's own sensor / lock setting. */
    @PluginMethod
    public void unlock(PluginCall call) {
        getActivity()
            .setRequestedOrientation(
                ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
            );
        call.resolve();
    }
}
