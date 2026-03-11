package com.ejinaustin.double12express;

import android.os.Bundle;

import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // BEGIN: Immersive (hide status + nav bars, show temporarily on swipe)
    private void applyImmersiveMode() {
        WindowInsetsControllerCompat c =
                ViewCompat.getWindowInsetsController(getWindow().getDecorView());

        if (c != null) {
            // Let bars re-appear briefly when the user swipes
            c.setSystemBarsBehavior(
                    WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            );

            // Hide both status bar + navigation bar (gesture pill area)
            c.hide(WindowInsetsCompat.Type.systemBars());

            // Keep icons (if/when bars appear) readable over dark UI
            c.setAppearanceLightStatusBars(false);
            c.setAppearanceLightNavigationBars(false);
        }
    }
    // END: Immersive

    @Override
    protected void onCreate(Bundle savedInstanceState) {

        // Make edge-to-edge behavior consistent on Android < 15.
        // (Android 15+ targeting SDK 35 is edge-to-edge by default.)
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        super.onCreate(savedInstanceState);

        // Apply immersive mode after the activity is created
        applyImmersiveMode();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);

        // Re-apply immersive mode when returning to the app
        if (hasFocus) {
            applyImmersiveMode();
        }
    }
}