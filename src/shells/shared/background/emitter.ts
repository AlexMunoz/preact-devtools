export type Handler<T> = (e: T) => void;

export function Mitt<T = any>() {
	const listeners = new Map<string, Handler<T>[]>();
	return {
		listeners,
		on(type: string, handler: Handler<T>) {
			const arr = listeners.get(type) || [];
			arr.push(handler);
			listeners.set(type, arr);
		},
		off(type: string, handler: Handler<T>) {
			const arr = listeners.get(type) || [];
			const idx = arr.indexOf(handler);
			if (arr.length > 1) {
				if (idx > -1) {
					arr.splice(idx, 1);
				}
			} else {
				listeners.delete(type);
			}
		},
		emit(type: string, event: T) {
			//
		},
	};
}
