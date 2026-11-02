# Financeiro (app Android)

App em HTML (Capacitor) ligado ao seu bot/planilha, com **widget** e o **Addit** (janelinha de lançar sem abrir o app).

## Como gerar o APK
1. Crie um repositório no GitHub (pode ser privado) e envie todo o conteúdo desta pasta (incluindo `.github`).
2. Aba **Actions** ▸ **Gerar APK** ▸ *Run workflow* (também roda sozinho a cada push).
3. Quando terminar (uns 5 min), baixe o `Financeiro.apk` em **Releases ▸ APK mais recente** (pelo celular mesmo) e instale.
   O APK usa sempre a mesma chave de assinatura, então os próximos instalam por cima, sem desinstalar.

## Primeiro uso
1. Abra o app ▸ **Mais ▸ Conexão**: cole o link `/exec` do Apps Script e a `CHAVE_API`. Toque em **Salvar e testar**.
2. Widget: segure um espaço vazio da tela inicial ▸ **Widgets ▸ Financeiro**.
   - **− Saída** / **+ Entrada** abrem o Addit; escreva como no bot (`25 mercado`, `+50 mae pix`, `300 tv 10x`, `t 100 pix din`).
   - Tocar no valor atualiza o saldo.
3. Atalho extra: segure o ícone do app ▸ **Lançar**.

## Estrutura
- `www/index.html` — todo o layout e a lógica do app.
- `android/.../QuickAddActivity.java` — Addit. `FinWidget.java` — widget. `Api.java` — conversa com o Apps Script (+ fila offline).
- `.github/workflows/apk.yml` — compila e publica o APK.

## Versão para iPhone (Safari)
A pasta `docs/` é o mesmo app em HTML, pronto para o GitHub Pages (Settings > Pages > branch main, pasta /docs).
No iPhone: abrir o endereço no Safari > Compartilhar > "Adicionar à Tela de Início". Ao mudar `www/index.html`, copie para `docs/index.html`.
