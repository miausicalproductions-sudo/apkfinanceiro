package app.financeiro.matheus;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.NumberFormat;
import java.util.Iterator;
import java.util.Locale;

/** Conversa com o Apps Script (mesma API usada pelo app em HTML) e guarda cache/fila para o widget. */
public class Api {
    /** O app em HTML grava "url" e "chave" aqui (plugin Preferences do Capacitor). */
    private static SharedPreferences cfg(Context c) { return c.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE); }
    private static SharedPreferences fin(Context c) { return c.getSharedPreferences("fin", Context.MODE_PRIVATE); }

    public static boolean configurado(Context c) {
        return cfg(c).getString("url", "").startsWith("https://") && !cfg(c).getString("chave", "").isEmpty();
    }

    /** POST JSON (text/plain, como o Apps Script espera). IOException = sem conexão; IllegalStateException = app não configurado. */
    public static JSONObject post(Context c, JSONObject body) throws Exception {
        if (!configurado(c)) throw new IllegalStateException("Abra o app uma vez e configure o link e a chave.");
        body.put("chave", cfg(c).getString("chave", ""));
        HttpURLConnection con = (HttpURLConnection) new URL(cfg(c).getString("url", "")).openConnection();
        try {
            con.setRequestMethod("POST");
            con.setConnectTimeout(15000);
            con.setReadTimeout(40000);
            con.setInstanceFollowRedirects(true);   // o Apps Script responde com um redirecionamento
            con.setDoOutput(true);
            con.setRequestProperty("Content-Type", "text/plain; charset=utf-8");
            OutputStream os = con.getOutputStream();
            os.write(body.toString().getBytes("UTF-8"));
            os.close();
            InputStream is = con.getResponseCode() >= 400 ? con.getErrorStream() : con.getInputStream();
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[4096]; int n;
            while (is != null && (n = is.read(buf)) > 0) bo.write(buf, 0, n);
            String txt = bo.toString("UTF-8").trim();
            if (!txt.startsWith("{")) throw new IllegalStateException("Resposta inesperada do servidor (confira o link e a implantação).");
            return new JSONObject(txt);
        } finally { con.disconnect(); }
    }

    public static String reais(double v) {
        return NumberFormat.getCurrencyInstance(new Locale("pt", "BR")).format(v).replace(' ', ' ');
    }

    /** Guarda o último saldo para o widget mostrar mesmo sem internet. */
    public static void guardarSaldo(Context c, JSONObject r) {
        try {
            fin(c).edit().putString("saldos", r.optJSONObject("saldos") != null ? r.optJSONObject("saldos").toString() : "{}")
                    .putFloat("total", (float) r.optDouble("total", 0))
                    .putLong("ts", System.currentTimeMillis()).apply();
        } catch (Exception ignored) {}
    }
    public static float total(Context c) { return fin(c).getFloat("total", Float.NaN); }
    public static long quando(Context c) { return fin(c).getLong("ts", 0); }
    public static String carteiras(Context c) {
        try {
            JSONObject s = new JSONObject(fin(c).getString("saldos", "{}"));
            StringBuilder sb = new StringBuilder();
            Iterator<String> it = s.keys();
            while (it.hasNext()) { String k = it.next(); if (sb.length() > 0) sb.append("  ·  "); sb.append(k).append(' ').append(reais(s.optDouble(k))); }
            return sb.toString();
        } catch (Exception e) { return ""; }
    }

    /* ---- fila offline: lançamentos feitos sem internet são reenviados depois (id evita duplicar) ---- */
    public static synchronized void enfileirar(Context c, String id, String texto) {
        try {
            JSONArray q = new JSONArray(fin(c).getString("fila", "[]"));
            q.put(new JSONObject().put("id", id).put("texto", texto));
            fin(c).edit().putString("fila", q.toString()).apply();
        } catch (Exception ignored) {}
    }
    public static synchronized int pendentes(Context c) {
        try { return new JSONArray(fin(c).getString("fila", "[]")).length(); } catch (Exception e) { return 0; }
    }
    /** Reenvia a fila. Devolve a última resposta de sucesso (ou null). */
    public static synchronized JSONObject enviarFila(Context c) {
        JSONObject ultima = null;
        try {
            JSONArray q = new JSONArray(fin(c).getString("fila", "[]"));
            JSONArray resto = new JSONArray();
            boolean parou = false;
            for (int i = 0; i < q.length(); i++) {
                JSONObject it = q.getJSONObject(i);
                if (parou) { resto.put(it); continue; }
                try {
                    JSONObject r = post(c, new JSONObject().put("acao", "texto").put("texto", it.getString("texto")).put("id", it.getString("id")));
                    if (r.has("erro")) continue;      // texto inválido: descarta
                    ultima = r;
                } catch (Exception e) { parou = true; resto.put(it); }   // sem rede ou servidor fora: tenta de novo depois
            }
            fin(c).edit().putString("fila", resto.toString()).apply();
        } catch (Exception ignored) {}
        if (ultima != null) guardarSaldo(c, ultima);
        return ultima;
    }
}
