package app.financeiro.matheus;

import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

public class MainActivity extends BridgeActivity {
    /** Comprovante recebido pelo "Compartilhar", esperando o app em HTML buscar. */
    static byte[] recebido;
    static String recebidoMime = "";
    static final Object trava = new Object();

    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AvisosPlugin.class);
        super.onCreate(savedInstanceState);
        try { AvisoWorker.agendar(this); } catch (Exception ignored) {}
        receber(getIntent());
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        receber(intent);
    }

    @SuppressWarnings("deprecation")
    private void receber(Intent it) {
        try {
            if (it == null || !Intent.ACTION_SEND.equals(it.getAction())) return;
            Uri u = null;
            ClipData cd = it.getClipData();
            if (cd != null && cd.getItemCount() > 0) u = cd.getItemAt(0).getUri();
            if (u == null) u = (Uri) it.getParcelableExtra(Intent.EXTRA_STREAM);
            if (u == null) return;
            final Uri uri = u;
            String m = getContentResolver().getType(uri);
            if (m == null || m.isEmpty()) m = it.getType();
            final String mime = m == null ? "image/jpeg" : m;
            it.setAction(Intent.ACTION_MAIN);      // não reprocessar ao girar a tela
            new Thread(() -> {
                try (InputStream in = getContentResolver().openInputStream(uri)) {
                    if (in == null) return;
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    byte[] buf = new byte[16384]; int n, tot = 0;
                    while ((n = in.read(buf)) > 0) { tot += n; if (tot > 12 * 1024 * 1024) return; out.write(buf, 0, n); }
                    synchronized (trava) { recebido = out.toByteArray(); recebidoMime = mime; }
                    runOnUiThread(() -> { try { if (getBridge() != null) getBridge().triggerWindowJSEvent("compartilhado"); } catch (Exception ignored) {} });
                } catch (Exception ignored) {}
            }).start();
        } catch (Exception ignored) {}
    }
}
