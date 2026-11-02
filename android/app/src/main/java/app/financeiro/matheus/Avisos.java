package app.financeiro.matheus;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/** Monta e mostra o aviso de vencimentos (véspera, dia e atrasados). */
public class Avisos {
    public static final String CANAL = "vencimentos";

    public static boolean permitido(Context c) {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(c, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false;
        return NotificationManagerCompat.from(c).areNotificationsEnabled();
    }

    static void criarCanal(Context c) {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CANAL, "Vencimentos", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Contas e parcelas que vencem hoje, amanhã ou estão atrasadas");
            ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).createNotificationChannel(ch);
        }
    }

    static String hojeIso(int somaDias) {
        Calendar k = Calendar.getInstance();
        k.add(Calendar.DAY_OF_YEAR, somaDias);
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(k.getTime());
    }

    /** Lista guardada pelo app em HTML (chave "agenda" nas preferências do Capacitor). */
    static JSONArray guardada(Context c) {
        try {
            SharedPreferences p = c.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
            return new JSONArray(p.getString("agenda", "[]"));
        } catch (Exception e) { return new JSONArray(); }
    }

    /** Itens do servidor (acao agenda): {data, tipo, valor, descricao, n, total}. Se falhar, usa a lista guardada. */
    static JSONArray itens(Context c) {
        try {
            if (Api.configurado(c)) {
                JSONObject r = Api.post(c, new JSONObject().put("acao", "agenda"));
                JSONArray a = r.optJSONArray("itens");
                if (a != null) {
                    JSONArray out = new JSONArray();
                    for (int i = 0; i < a.length(); i++) {
                        JSONObject o = a.getJSONObject(i);
                        out.put(new JSONObject().put("d", o.optString("data")).put("t", o.optString("tipo")).put("v", o.optDouble("valor"))
                                .put("x", o.optString("descricao")).put("n", o.optInt("n", 0)).put("tt", o.optInt("total", 0)));
                    }
                    return out;
                }
            }
        } catch (Exception ignored) {}
        return guardada(c);
    }

    /** manha=true: hoje + amanhã + atrasados; manha=false (18h): só hoje + atrasados. teste=true: mostra algo mesmo sem vencimentos. */
    public static int avisar(Context c, boolean manha, boolean teste) {
        if (!permitido(c)) return -1;
        String hoje = hojeIso(0), amanha = hojeIso(1);
        JSONArray todos = itens(c);
        List<String> linhas = new ArrayList<>();
        for (int i = 0; i < todos.length(); i++) {
            JSONObject o = todos.optJSONObject(i);
            if (o == null) continue;
            String d = o.optString("d");
            String quando = d.compareTo(hoje) < 0 ? "Atrasado" : d.equals(hoje) ? "Hoje" : d.equals(amanha) && manha ? "Amanhã" : null;
            if (quando == null) continue;
            boolean entrada = "E".equals(o.optString("t"));
            String nome = o.optString("x");
            int n = o.optInt("n", 0), tt = o.optInt("tt", 0);
            if (tt > 0) nome += " " + n + "/" + tt;
            linhas.add(quando + ": " + nome + " · " + Api.reais(o.optDouble("v")) + (entrada ? " (a receber)" : ""));
        }
        if (linhas.isEmpty() && !teste) return 0;
        criarCanal(c);
        String titulo = linhas.isEmpty() ? "Avisos ativados" : (linhas.size() == 1 ? "1 vencimento" : linhas.size() + " vencimentos");
        NotificationCompat.InboxStyle st = new NotificationCompat.InboxStyle();
        for (String l : linhas) st.addLine(l);
        String resumo = linhas.isEmpty() ? "Quando algo vencer, você recebe um aviso na véspera e no dia." : linhas.get(0);
        Intent abrir = new Intent(c, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, 0, abrir, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CANAL)
                .setSmallIcon(R.drawable.ic_notif)
                .setContentTitle(titulo)
                .setContentText(resumo)
                .setStyle(linhas.isEmpty() ? new NotificationCompat.BigTextStyle().bigText(resumo) : st)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pi);
        try { NotificationManagerCompat.from(c).notify(7001, b.build()); } catch (SecurityException e) { return -1; }
        return linhas.size();
    }
}
