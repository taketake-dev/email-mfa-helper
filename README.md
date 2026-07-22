# Email MFA Helper

RD講義資料ページのメール二段階認証で、大学 Outlook Web に届く6桁コードを Chrome 拡張機能で Moodle の入力欄へ設定するプロジェクト。

## 現在地

最小実装は完成し、実際の Moodle 認証画面で次の一連の動作を確認済みである。

1. Moodle の二段階認証画面を検出する。
2. Outlook Web の専用タブを前面で開く。
3. 対象メールを判別して6桁コードを取得する。
4. Moodle のコード欄へ入力し、専用 Outlook タブを閉じる。メールが見つからない場合は Moodle に戻り、Outlook タブを残して手動確認を案内する。

送信ボタンは自動で押さないが、6桁コードの入力後はMoodle側の仕様により自動送信される。認証コードはMoodleの入力欄への設定以外で表示せず、メール情報、認証用リンク、資格情報を保存・外部送信しない。初回は、Outlook Webの受信トレイ一覧にある対象行の情報を端末内で一時処理することへの明示同意が必要である。

## 利用方法

1. Chrome の「パッケージ化されていない拡張機能を読み込む」から、このリポジトリを読み込む。
2. 初回だけ、Moodleの二段階認証画面で処理内容を確認して同意する。
3. Chrome 内で大学 Outlook Web へ本人がログインする。
4. Moodle で本人が ID・パスワードを入力し、二段階認証画面を表示する。
5. 専用 Outlook タブが前面に開く。受信トレイ一覧を表示後、最大10秒対象メールを確認する。コード取得後はMoodleの入力欄へ設定されてタブが閉じる。見つからない場合はMoodleへ戻り、Outlookタブを残す。

## 制約と次の作業

- 大学管理者の承認、Microsoft Graph API、メール転送、外部サーバーには依存しない。
- Outlook Web の画面構造に依存するため、画面変更時は検出方法を見直す。
- Outlook未ログイン後の取得継続、10秒の時間切れ時のMoodle復帰・Outlookタブ保持、成功時のコード入力・ログイン完了は実機で確認済みである。
- 同意は拡張機能の設定画面から取り消せる。取り消すと、実行中の自動確認も即時停止する。
- Chrome Web Store公開準備は[公開準備](./docs/chrome-web-store.md)と[掲載文案](./docs/store-listing.md)に記録する。

## 開発時の検証

```powershell
npm run check
npm test
```

- `npm run check` は Manifest、参照ファイル、JavaScript の構文を確認する。
- `npm test` は Outlook のコード抽出・受信日時判定・対象ホスト権限・通常フローの構成を確認する。

## 関連文書

1. [Moodle画面仕様](./docs/moodle-spec.md)
2. [要件](./docs/requirements.md)
3. [設計](./docs/design.md)
4. [調査・検証記録](./docs/research.md)
5. [判断記録](./docs/decisions.md)
6. [検証状況と次の作業](./docs/plan.md)
7. [Chrome Web Store公開準備](./docs/chrome-web-store.md)
8. [Chrome Web Store掲載文案](./docs/store-listing.md)
9. [公開サイト](https://taketake-dev.github.io/email-mfa-helper/)
