export class ApprovalManager {
  readonly fileWritesEnabled = false;

  explainReadOnlyMode(): string {
    return "v0.1은 노트를 직접 수정하지 않고 수정 제안만 표시합니다.";
  }
}
