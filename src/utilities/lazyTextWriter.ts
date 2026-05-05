type LazyWriteFunction<T> = (value: T) => Promise<void> | void;

interface LazyWriteEntry<T> {
    timer: ReturnType<typeof setTimeout> | undefined;
    value: T;
    write: LazyWriteFunction<T>;
}

export class LazyTextWriter<T> {
    private readonly entries = new Map<string, LazyWriteEntry<T>>();

    constructor(
        private readonly delayMs: number,
        private readonly onError: (error: unknown) => void = () => { }
    ) { }

    public queue(key: string, value: T, write: LazyWriteFunction<T>) {
        const entry = this.entries.get(key) ?? {
            timer: undefined,
            value,
            write,
        };

        if (entry.timer) {
            clearTimeout(entry.timer);
        }

        entry.value = value;
        entry.write = write;
        entry.timer = setTimeout(() => {
            entry.timer = undefined;
            void this.flush(key);
        }, this.delayMs);

        this.entries.set(key, entry);
    }

    public hasPending(key: string): boolean {
        return this.entries.has(key);
    }

    public async flush(key?: string): Promise<void> {
        if (key === undefined) {
            await Promise.all([...this.entries.keys()].map(entryKey => this.flush(entryKey)));
            return;
        }

        const entry = this.entries.get(key);
        if (!entry) {
            return;
        }

        if (entry.timer) {
            clearTimeout(entry.timer);
            entry.timer = undefined;
        }

        const value = entry.value;
        try {
            await entry.write(value);
        } catch (error) {
            this.onError(error);
            return;
        }

        const latest = this.entries.get(key);
        if (latest !== entry) {
            return;
        }

        if (latest.value !== value) {
            await this.flush(key);
            return;
        }

        this.entries.delete(key);
    }

    public dispose() {
        for (const entry of this.entries.values()) {
            if (entry.timer) {
                clearTimeout(entry.timer);
                entry.timer = undefined;
            }
        }
        void this.flush();
    }
}
