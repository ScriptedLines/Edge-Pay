package com.example.paytmintent;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register native plugins BEFORE super.onCreate() so they are
        // available to the WebView immediately on first load.
        registerPlugin(EdgePayPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
