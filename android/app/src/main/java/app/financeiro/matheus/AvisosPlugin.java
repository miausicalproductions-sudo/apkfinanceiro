package app.financeiro.matheus;

import android.Manifest;
import android.os.Build;

import androidx.core.app.ActivityCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Ponte entre o app em HTML e os avisos nativos: pedir permissão e testar. */
@CapacitorPlugin(name = "Avisos")
public class AvisosPlugin extends Plugin {
    @PluginMethod
    public void permissao(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= 33 && !Avisos.permitido(getContext()) && getActivity() != null)
                ActivityCompat.requestPermissions(getActivity(), new String[]{Manifest.permission.POST_NOTIFICATIONS}, 7001);
            AvisoWorker.agendar(getContext());
            JSObject r = new JSObject();
            r.put("ativo", Avisos.permitido(getContext()));
            call.resolve(r);
        } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
    }

    @PluginMethod
    public void testar(PluginCall call) {
        new Thread(() -> {
            try {
                int n = Avisos.avisar(getContext(), true, true);
                JSObject r = new JSObject();
                r.put("ativo", n >= 0);
                r.put("itens", Math.max(n, 0));
                call.resolve(r);
            } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
        }).start();
    }
}
