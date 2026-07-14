export class ApprovalManager {
  readonly fileWritesEnabled = false;

  explainReadOnlyMode(): string {
    return "파일 변경이 필요한 작업은 먼저 제안으로 보여주고, 사용자가 승인한 뒤 적용합니다.";
  }
}
