package app.financeiro.matheus;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Widget da tela inicial: saldo + botões "− Saída" e "+ Entrada" que abrem o Addit. */
public class FinWidget extends AppWidgetProvider {
    public static final String ACAO_ATUALIZAR = "app.financeiro.matheus.ATUALIZAR";

    @Override public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        desenhar(c, m, ids);
        buscar(c, goAsync());
    }

    @Override public void onReceive(Context c, Intent i) {
        super.onReceive(c, i);
        if (ACAO_ATUALIZAR.equals(i.getAction())) {
            AppWidgetManager m = AppWidgetManager.getInstance(c);
            desenhar(c, m, m.getAppWidgetIds(new ComponentName(c, FinWidget.class)));
            buscar(c, goAsync());
        }
    }

    /** Busca o saldo no servidor em segundo plano e redesenha. */
    private static void buscar(final Context c, final BroadcastReceiver.PendingResult pr) {
        new Thread(new Runnable() { public void run() {
            try {
                if (Api.configurado(c)) {
                    if (Api.pendentes(c) > 0) Api.enviarFila(c);
                    JSONObject r = Api.post(c, new JSONObject().put("acao", "resumo"));
                    if (r.optInt("ok") == 1) Api.guardarSaldo(c, r);
                }
            } catch (Exception ignored) {
            } finally {
                atualizarTodos(c);
                if (pr != null) pr.finish();
            }
        } }).start();
    }

    /** Redesenha com o último saldo guardado (rápido, sem rede). */
    public static void atualizarTodos(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        desenhar(c, m, m.getAppWidgetIds(new ComponentName(c, FinWidget.class)));
    }

    private static PendingIntent abrirAddit(Context c, int cod, String prefixo) {
        Intent i = new Intent(c, QuickAddActivity.class);
        i.putExtra("prefixo", prefixo);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(c, cod, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void desenhar(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) {
            RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget);
            float total = Api.total(c);
            if (!Api.configurado(c)) {
                v.setTextViewText(R.id.wTotal, "Configurar");
                v.setTextViewText(R.id.wSub, "Abra o app e coloque o link e a chave");
                v.setTextViewText(R.id.wHora, "");
            } else {
                v.setTextViewText(R.id.wTotal, Float.isNaN(total) ? "—" : Api.reais(total));
                String sub = Api.carteiras(c);
                int pend = Api.pendentes(c);
                if (pend > 0) sub += (sub.isEmpty() ? "" : "  ·  ") + "⏳ " + pend + " a enviar";
                v.setTextViewText(R.id.wSub, sub.isEmpty() ? "Toque para atualizar" : sub);
                long q = Api.quando(c);
                v.setTextViewText(R.id.wHora, q == 0 ? "" : new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date(q)));
            }
            v.setOnClickPendingIntent(R.id.wBtnSaida, abrirAddit(c, 1, ""));
            v.setOnClickPendingIntent(R.id.wBtnEntrada, abrirAddit(c, 2, "+"));
            Intent app = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
            if (app != null) v.setOnClickPendingIntent(R.id.wBtnApp, PendingIntent.getActivity(c, 3, app, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
            Intent up = new Intent(c, FinWidget.class).setAction(ACAO_ATUALIZAR);
            v.setOnClickPendingIntent(R.id.wTotal, PendingIntent.getBroadcast(c, 4, up, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
            m.updateAppWidget(id, v);
        }
    }
}
