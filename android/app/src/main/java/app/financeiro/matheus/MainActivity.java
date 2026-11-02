package app.financeiro.matheus;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AvisosPlugin.class);
        super.onCreate(savedInstanceState);
        try { AvisoWorker.agendar(this); } catch (Exception ignored) {}
    }
}
