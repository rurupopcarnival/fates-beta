-- 7F7S クローズドβテスト：評価・プレイ記録（1プレイ＝1件）
-- 名前・Xアカウント・メールアドレス・IPアドレスは保存しない
CREATE TABLE IF NOT EXISTS feedback (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at     TEXT NOT NULL,            -- 送信日時（UTC, ISO 8601）
  test_round     TEXT NOT NULL,            -- テスト回（例：staff-check, beta1）
  play_id        TEXT NOT NULL UNIQUE,     -- 1プレイごとのランダムID（二重送信防止）
  player_id      TEXT NOT NULL,            -- 端末ごとのランダムID（同じ端末の複数プレイの区別のみ）
  status         TEXT NOT NULL,            -- completed（完走） / quit（途中終了）
  scenario_id    TEXT NOT NULL,            -- 台本のファイル名（例：01-mystery）
  scenario_title TEXT NOT NULL,
  scenario_hash  TEXT NOT NULL,            -- 台本の版（台本のSHA-256先頭12文字）
  ending         TEXT,                     -- 結末名（途中終了はNULL）
  play_seconds   INTEGER,
  pages          INTEGER,
  spark_used     INTEGER NOT NULL,
  fate_used      INTEGER NOT NULL,
  sparks         TEXT NOT NULL,            -- JSON：[{title, n, label}]
  fates          TEXT NOT NULL,            -- JSON：[{title, v, how(通常/マジック/手動), rolls(確定までに振った回数)}]
  answers        TEXT NOT NULL,            -- JSON：評価項目①〜⑨
  comment        TEXT NOT NULL DEFAULT '', -- 自由感想（最大1000字）
  device         TEXT NOT NULL             -- mobile / pc / unknown
);
CREATE INDEX IF NOT EXISTS idx_feedback_round ON feedback(test_round, scenario_id, created_at);
