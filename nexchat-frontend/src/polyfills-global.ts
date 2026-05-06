/**
 * sockjs-client / một số gói CommonJS kỳ vọng `global` như trong Node.
 * Trình duyệt chỉ có `window` / `globalThis` → gán alias để tránh ReferenceError.
 */
const g = globalThis as typeof globalThis & { global?: typeof globalThis };
if (typeof g.global === 'undefined') {
    g.global = g;
}
