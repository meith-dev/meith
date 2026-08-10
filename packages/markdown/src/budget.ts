export class NodeBudget {
  private used = 0
  public exhausted = false

  constructor(private readonly max: number) {}

  take(): boolean {
    if (this.used >= this.max) {
      this.exhausted = true
      return false
    }
    this.used += 1
    return true
  }

  get spent(): boolean {
    return this.used >= this.max
  }

  exhaust(): void {
    this.exhausted = true
  }
}
