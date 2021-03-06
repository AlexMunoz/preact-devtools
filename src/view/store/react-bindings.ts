import { createContext } from "preact";
import { useEffect, useContext, useState, useMemo, useRef } from "preact/hooks";
import { Store } from "./types";
import { EmitFn } from "../../adapter/hook";
import { watch, Observable } from "../valoo";

export const AppCtx = createContext<Store>(null as any);
export const EmitCtx = createContext<EmitFn>(() => null);

export const useEmitter = () => useContext(EmitCtx);
export const useStore = () => useContext(AppCtx);

export function useObserver<T>(fn: () => T): T {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const [_, set] = useState(0);
	const count = useRef(0);
	const tmp = useRef<any>(null as any);
	const ref = useRef<Observable<T>>(tmp.current || (tmp.current = watch(fn)));

	const dispose = useMemo(() => {
		const disp = ref.current.on(() => {
			set((count.current = count.current + 1));
		});
		return () => {
			disp();
			ref.current._disposers.forEach(disp => disp());
		};
	}, []);

	useEffect(() => {
		return () => dispose();
	}, []);

	return ref.current.$;
}
