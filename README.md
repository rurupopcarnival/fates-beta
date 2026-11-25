# fates-beta（7 Fates, 7 Sparks クローズドβテスト）

- 作成者：ネロ　作成日：2026-11-25（複数シナリオ対応・更新ツール対応 2026-11-25）　状態：【準備完了・未デプロイ】（議題042・044）
- 公開方法：GitHub（rurupopcarnival/fates-beta）＋ Cloudflare Workers Builds の自動デプロイ。台本の追加・差し替えは「RuruPop 更新ツール」から行う
- URL：https://beta.rurupop.com/（サイト本体・量産抽選とは別のWorker）
- 名前に規定回数を含めない方針（036）により、内部名は `fates-beta`、D1は `fates_beta`

## 1. 何ができるか

| 機能 | 内容 |
|---|---|
| ログイン | 共通ID・パスワード（サーバー側のシークレット）。成功すると14日間有効の署名付きCookie。1分に6回以上間違えると一時的に受け付けない |
| シナリオ | `scenarios/` の台本をすべて一覧に表示し、テスターが選んで遊ぶ。ファイル名が `_` で始まる台本はスタッフ確認用（テスト回が `staff` で始まるときだけ表示）。評価データはシナリオごとに区別して保存 |
| 公開範囲 | ログイン画面以外は、ログインした人だけ。台本はログイン後にだけ配信。台本・検証タブ、隠しステータスはなし。検索エンジンには出さない |
| プレイ | 開始画面（テストの目的・将来のオリジナルシナリオ・クレジット・遊び方・記録内容）→ プレイ → 結末。「続きから」で再開できる |
| 評価送信 | 結末、または「途中でやめる」から送信（任意）。評価①〜⑨＋自由感想⑩。完走と途中終了は区別して保存 |
| 保存内容 | 結末、選んだ行動、出目、ダイスの種類、ダイスを振った回数、プレイ時間、ページ数、スマホ/PC、端末ごとのランダム番号。名前・SNSアカウント・メール・IPは保存しない |
| 受付終了 | `BETA_OPEN` を `false` にすると「受け付けていません」だけを表示。ログインも送信も止まる |

## 2. ファイル

```
fates-beta/
├─ scenarios/              テスト用台本（台本記法v0.2）。1ファイル＝1シナリオ。ファイル名は半角英小文字・数字・ハイフン（例 01-mystery.txt）
│   └─ _hotel-check.txt    スタッフ確認用（13番目のホテル）
├─ src/pages/app.html      プレイ画面とアンケート
├─ src/pages/login.html    ログイン画面
├─ src/pages/closed.html   受付終了画面
├─ src/engine.cjs          試作ツールv0.2と同じエンジン（@クレジット に対応）
├─ src/worker.js           Worker本体（認証・台本配信・保存）
├─ src/assets.js           自動生成（node build.mjs）。直接編集しない
├─ build.mjs               台本をすべて検証して assets.js を作る（エラーがあればビルド失敗＝公開されない）
├─ schema.sql              D1のテーブル
└─ wrangler.jsonc          設定（シークレットはここに書かない）
```

## 3. 台本の追加・差し替え（通常はこれだけ）

1. セラが台本を書き、ネロが検証して、更新用ZIP（`update.json` ＋ `scenarios/〇〇.txt`）を作る。
2. るるが「RuruPop 更新ツール」（update.rurupop.com）で、更新先「7F7S クローズドβテスト」とZIPを選び、内容を確認して反映する。
3. 自動でビルド・公開される。台本にエラーがあれば、更新ツールの確認画面で止まる（ビルドでも再検証する）。

台本の先頭には `@クレジット 制作：セラ（AI）／監修：るる` を入れる。

## 4. 初回の準備

- D1データベース `fates_beta` とテーブルは作成済み（2026-11-25、ネロ）。
- GitHubリポジトリの作成、Cloudflareとの接続、シークレットの登録は「7F7S β・更新ツール 初回設定の手順書」に沿ってるるが行う。
- Workers Builds の設定：ビルドコマンド `npm run build`、デプロイコマンド `npx wrangler deploy`。
- シークレット（Cloudflareの画面で登録）：`BETA_ID`（テスターに伝えるID）、`BETA_PASSWORD`（テスターに伝えるパスワード）、`COOKIE_SECRET`（長いランダム文字列。だれにも伝えない）

- `TEST_ROUND`（wrangler.jsonc）：テスト回の名前。スタッフ確認中は `staff-check`、友人テストは `beta1` など。データはこの名前で区別される。
- 友人テストを始める前に、スタッフ確認で使ったパスワードは変えておく（変えると、それまでのログインはすべて無効になる）。

## 5. テストの開始・終了

| 操作 | 方法 |
|---|---|
| 受付中にする／止める | wrangler.jsonc の `BETA_OPEN`（`"true"`／`"false"`）をネロが変更してGitHubに反映 → 自動で公開 |
| テスト回を変える | wrangler.jsonc の `TEST_ROUND`（例：`staff-check` → `beta1`）をネロが変更 |
| パスワードを変える | Cloudflareの画面で `BETA_PASSWORD` を変更（全員ログインし直し） |

## 6. データの取得（ネロ）

ネロが会話からCloudflareの接続ツールでD1を読み出し、集計する。手元で見る場合：

```
npx wrangler d1 execute fates_beta --remote --json --command "SELECT * FROM feedback WHERE test_round='beta1' ORDER BY id"
```

## 7. 片付け（042：ローカル保存を確認してから削除）

1. ネロが全データを書き出し、集計・分析レポートと一緒にるるのローカルへ保存する。
2. 保存を確認したら、サーバーのデータを削除：`npx wrangler d1 execute fates_beta --remote --command "DELETE FROM feedback"`
3. テスト環境ごと片付ける場合：`npx wrangler delete`、`npx wrangler d1 delete fates_beta`

## 8. 手元での動作確認

`.dev.vars` に仮のID・パスワードを書いて：

```
BETA_ID=tester
BETA_PASSWORD=local-pass
COOKIE_SECRET=local-secret-0123456789
```

```
npx wrangler d1 execute fates_beta --local --file schema.sql
node build.mjs && npx wrangler dev
```

## 9. ネロが確認済みのこと（2026-11-25、手元の環境）

- スマホ・PCの画面幅で、ログイン → 最後までプレイ → 評価送信、途中でやめて送信、再読み込みからの「続きから」
- 保存データ（完走・途中終了の区別、ダイスの種類、振った回数、感想の文字はそのまま文字として保存）
- 間違ったパスワード、改ざんしたCookie、他サイトからの送信、不正なデータの拒否
- ログイン失敗が続くと一時的に受け付けない
- 受付終了の表示と送信停止
- ログイン前の画面に台本が含まれないこと、検索エンジン除けの指定
