export class DebouncedAction {
    private timer: ReturnType<typeof setTimeout> | undefined;

    constructor(
        private readonly action: () => void,
        private readonly delayMs: number
    ) { }

    public schedule() {
        this.cancel();
        this.timer = setTimeout(() => {
            this.timer = undefined;
            this.action();
        }, this.delayMs);
    }

    public flush() {
        if (!this.timer) {
            return;
        }

        this.cancel();
        this.action();
    }

    public cancel() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
    }

    public dispose() {
        this.cancel();
    }
}
