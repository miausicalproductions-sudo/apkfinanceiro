package app.financeiro.matheus;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Data;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.util.Calendar;
import java.util.concurrent.TimeUnit;

/** Roda todo dia às 9h (hoje, amanhã e atrasados) e às 18h (hoje e atrasados, para quem ainda não pagou). */
public class AvisoWorker extends Worker {
    public AvisoWorker(@NonNull Context c, @NonNull WorkerParameters p) { super(c, p); }

    @NonNull @Override public Result doWork() {
        try { Avisos.avisar(getApplicationContext(), getInputData().getBoolean("manha", true), false); } catch (Exception ignored) {}
        return Result.success();
    }

    static long ate(int hora) {
        Calendar a = Calendar.getInstance(), k = Calendar.getInstance();
        k.set(Calendar.HOUR_OF_DAY, hora); k.set(Calendar.MINUTE, 0); k.set(Calendar.SECOND, 0); k.set(Calendar.MILLISECOND, 0);
        if (!k.after(a)) k.add(Calendar.DAY_OF_YEAR, 1);
        return k.getTimeInMillis() - a.getTimeInMillis();
    }

    /** Agenda os dois horários (KEEP: não reinicia a contagem a cada vez que o app abre). */
    public static void agendar(Context c) {
        WorkManager wm = WorkManager.getInstance(c);
        wm.enqueueUniquePeriodicWork("avisos-manha", ExistingPeriodicWorkPolicy.KEEP,
                new PeriodicWorkRequest.Builder(AvisoWorker.class, 24, TimeUnit.HOURS)
                        .setInitialDelay(ate(9), TimeUnit.MILLISECONDS)
                        .setInputData(new Data.Builder().putBoolean("manha", true).build()).build());
        wm.enqueueUniquePeriodicWork("avisos-tarde", ExistingPeriodicWorkPolicy.KEEP,
                new PeriodicWorkRequest.Builder(AvisoWorker.class, 24, TimeUnit.HOURS)
                        .setInitialDelay(ate(18), TimeUnit.MILLISECONDS)
                        .setInputData(new Data.Builder().putBoolean("manha", false).build()).build());
    }
}
