package app.financeiro.matheus;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

import java.io.IOException;
import java.util.UUID;

/** "Addit": janelinha de uma linha para lançar sem abrir o app. Aceita a mesma sintaxe do bot. */
public class QuickAddActivity extends Activity {
    private EditText et;
    private TextView msg, btnOk;
    private boolean ocupado = false;
    private final Handler ui = new Handler(Looper.getMainLooper());

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }
    private GradientDrawable fundo(int cor, int raio, int borda) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(cor); g.setCornerRadius(dp(raio));
        if (borda != 0) g.setStroke(dp(1), borda);
        return g;
    }
    private TextView botao(String t, int cor, int txt) {
        TextView b = new TextView(this);
        b.setText(t); b.setTextColor(txt); b.setTextSize(15); b.setTypeface(Typeface.DEFAULT_BOLD);
        b.setGravity(Gravity.CENTER); b.setBackground(fundo(cor, 14, 0));
        b.setPadding(dp(16), dp(13), dp(16), dp(13));
        return b;
    }

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE | WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
        getWindow().setDimAmount(0.55f);

        FrameLayout root = new FrameLayout(this);
        root.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { finish(); } });

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackground(fundo(Color.parseColor("#17212b"), 22, Color.parseColor("#2b3a4a")));
        card.setPadding(dp(18), dp(16), dp(18), dp(16));
        card.setClickable(true);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.TOP);
        lp.setMargins(dp(14), dp(80), dp(14), 0);
        root.addView(card, lp);

        TextView titulo = new TextView(this);
        titulo.setText("Lançar"); titulo.setTextColor(Color.parseColor("#e6edf3")); titulo.setTextSize(18); titulo.setTypeface(Typeface.DEFAULT_BOLD);
        card.addView(titulo);

        TextView dica = new TextView(this);
        dica.setText("25 mercado  ·  +50 mãe pix  ·  300 tv 10x  ·  t 100 pix din");
        dica.setTextColor(Color.parseColor("#8b9bb0")); dica.setTextSize(12);
        dica.setPadding(0, dp(2), 0, dp(10));
        card.addView(dica);

        et = new EditText(this);
        et.setHint("valor + descrição");
        et.setHintTextColor(Color.parseColor("#5d6b7c"));
        et.setTextColor(Color.WHITE); et.setTextSize(20);
        et.setSingleLine(true);
        et.setInputType(InputType.TYPE_CLASS_TEXT);
        et.setImeOptions(EditorInfo.IME_ACTION_SEND);
        et.setBackground(fundo(Color.parseColor("#0f1720"), 14, Color.parseColor("#2b3a4a")));
        et.setPadding(dp(14), dp(12), dp(14), dp(12));
        et.setOnEditorActionListener(new TextView.OnEditorActionListener() {
            public boolean onEditorAction(TextView v, int a, KeyEvent e) { enviar(); return true; }
        });
        card.addView(et);

        msg = new TextView(this);
        msg.setTextColor(Color.parseColor("#8b9bb0")); msg.setTextSize(14);
        msg.setPadding(0, dp(10), 0, 0);
        msg.setVisibility(View.GONE);
        card.addView(msg);

        LinearLayout linha = new LinearLayout(this);
        linha.setOrientation(LinearLayout.HORIZONTAL);
        linha.setPadding(0, dp(14), 0, 0);
        TextView cancelar = botao("Cancelar", Color.parseColor("#223142"), Color.parseColor("#c3cfdd"));
        cancelar.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { finish(); } });
        btnOk = botao("Lançar", Color.parseColor("#3b82f6"), Color.WHITE);
        btnOk.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { enviar(); } });
        LinearLayout.LayoutParams l1 = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        LinearLayout.LayoutParams l2 = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.6f);
        l2.setMargins(dp(10), 0, 0, 0);
        linha.addView(cancelar, l1); linha.addView(btnOk, l2);
        card.addView(linha);

        setContentView(root);

        String prefixo = getIntent().getStringExtra("prefixo");
        if (prefixo != null && !prefixo.isEmpty()) { et.setText(prefixo); et.setSelection(prefixo.length()); }
        et.requestFocus();

        // reenvia o que ficou pendente de lançamentos feitos sem internet
        new Thread(new Runnable() { public void run() { if (Api.pendentes(QuickAddActivity.this) > 0) Api.enviarFila(QuickAddActivity.this); } }).start();
    }

    private void aviso(String t, int cor) { msg.setVisibility(View.VISIBLE); msg.setText(t); msg.setTextColor(cor); }

    private void enviar() {
        if (ocupado) return;
        final String texto = et.getText().toString().trim();
        if (texto.isEmpty()) { aviso("Digite o valor e o que foi. Ex: 25 mercado", Color.parseColor("#f0b429")); return; }
        ocupado = true; btnOk.setAlpha(0.5f);
        aviso("Enviando…", Color.parseColor("#8b9bb0"));
        final String id = "x" + UUID.randomUUID().toString().replace("-", "").substring(0, 7);
        new Thread(new Runnable() { public void run() {
            try {
                JSONObject r = Api.post(QuickAddActivity.this, new JSONObject().put("acao", "texto").put("texto", texto).put("id", id));
                if (r.has("erro")) { falha(r.optString("erro")); return; }
                Api.guardarSaldo(QuickAddActivity.this, r);
                FinWidget.atualizarTodos(QuickAddActivity.this);
                final String t = "✅ " + r.optString("resumo") + "\nTotal: " + Api.reais(r.optDouble("total"));
                ui.post(new Runnable() { public void run() { aviso(t, Color.parseColor("#4cd07d")); } });
                ui.postDelayed(new Runnable() { public void run() { finish(); } }, 1300);
            } catch (IOException e) {
                Api.enfileirar(QuickAddActivity.this, id, texto);
                ui.post(new Runnable() { public void run() { aviso("📴 Sem conexão: guardei e envio quando voltar.", Color.parseColor("#f0b429")); } });
                ui.postDelayed(new Runnable() { public void run() { finish(); } }, 1600);
            } catch (Exception e) {
                falha(e.getMessage() == null ? "Erro ao enviar." : e.getMessage());
            }
        } }).start();
    }

    private void falha(final String m) {
        ui.post(new Runnable() { public void run() { ocupado = false; btnOk.setAlpha(1f); aviso("⚠️ " + m, Color.parseColor("#ff6b6b")); } });
    }
}
