import { BaseEvent, PortPageHook } from "../adapter/port";
import { Commit, MsgTypes, flush } from "../events/events";
import {
	Fragment,
	VNode,
	FunctionalComponent,
	ComponentConstructor,
} from "preact";
import { getStringId } from "../string-table";
import {
	isRoot,
	getAncestor,
	isSuspenseVNode,
	getDisplayName,
	getComponent,
	getDom,
	getActualChildren,
	getVNodeParent,
	hasDom,
	setNextState,
} from "./vnode";
import { shouldFilter } from "./filter";
import { ID } from "../../view/store/types";
import { traverse, setIn, SerializedVNode, setInCopy } from "./utils";
import { FilterState } from "../adapter/filter";
import { Renderer, Elements } from "../renderer";
import {
	createIdMappingState,
	getVNodeById,
	hasId,
	getVNodeId,
	hasVNodeId,
	removeVNodeId,
	IdMappingState,
	createVNodeId,
	updateVNodeId,
} from "./IdMapper";
import { logVNode } from "./renderer/logVNode";
import { inspectVNode } from "./renderer/inspectVNode";
import { getRenderReason, RenderReason } from "./renderer/renderReasons";

export interface RendererConfig10 {
	Fragment: FunctionalComponent;
	Component?: ComponentConstructor;
}

const memoReg = /^Memo\(/;
const forwardRefReg = /^ForwardRef\(/;
/**
 * Get the type of a vnode. The devtools uses these constants to differentiate
 * between the various forms of components.
 */
export function getDevtoolsType(vnode: VNode): Elements {
	if (typeof vnode.type == "function" && vnode.type !== Fragment) {
		const name = vnode.type.displayName || "";
		if (memoReg.test(name)) return Elements.MEMO;
		if (forwardRefReg.test(name)) return Elements.FORWARD_REF;
		if (isSuspenseVNode(vnode)) return Elements.SUSPENSE;

		// TODO: Provider and Consumer
		return vnode.type.prototype && vnode.type.prototype.render
			? Elements.CLASS_COMPONENT
			: Elements.FUNCTION_COMPONENT;
	}
	return Elements.HTML_ELEMENT;
}

export function isVNode(x: any): x is VNode {
	return x != null && x.type !== undefined && hasDom(x);
}

export function serializeVNode(
	x: any,
	config: RendererConfig10,
): SerializedVNode | null {
	if (isVNode(x)) {
		return {
			type: "vnode",
			name: getDisplayName(x, config),
		};
	}

	return null;
}

export function getFilteredChildren(
	vnode: VNode,
	filters: FilterState,
	config: RendererConfig10,
): VNode[] {
	const children = getActualChildren(vnode);
	const stack = children.slice();

	const out: VNode[] = [];

	let child;
	while (stack.length) {
		child = stack.pop();
		if (child != null) {
			if (!shouldFilter(child, filters, config)) {
				out.push(child);
			} else {
				const nextChildren = getActualChildren(child);
				if (nextChildren.length > 0) {
					stack.push(...nextChildren.slice());
				}
			}
		}
	}

	return out.reverse();
}

export function mount(
	ids: IdMappingState,
	commit: Commit,
	vnode: VNode,
	ancestorId: ID,
	filters: FilterState,
	domCache: WeakMap<HTMLElement | Text, VNode>,
	config: RendererConfig10,
	profiler: ProfilerState,
) {
	const root = isRoot(vnode, config);

	const skip = shouldFilter(vnode, filters, config);
	if (root || !skip) {
		const id = hasVNodeId(ids, vnode)
			? getVNodeId(ids, vnode)
			: createVNodeId(ids, vnode);
		if (isRoot(vnode, config)) {
			commit.operations.push(MsgTypes.ADD_ROOT, id);
		}

		commit.operations.push(
			MsgTypes.ADD_VNODE,
			id,
			getDevtoolsType(vnode), // Type
			ancestorId,
			9999, // owner
			getStringId(commit.strings, getDisplayName(vnode, config)),
			vnode.key ? getStringId(commit.strings, vnode.key) : 0,
			// Multiply, because operations array only supports integers
			// and would otherwise cut off floats
			(vnode.startTime || 0) * 1000,
			(vnode.endTime || 0) * 1000,
		);

		// Capture render reason (mount here)
		if (profiler.isProfiling && profiler.captureRenderReasons) {
			commit.operations.push(MsgTypes.RENDER_REASON, id, RenderReason.MOUNT, 0);
		}

		ancestorId = id;
	}

	if (skip && typeof vnode.type !== "function") {
		const dom = getDom(vnode);
		if (dom) domCache.set(dom, vnode);
	}

	const children = getActualChildren(vnode);
	for (let i = 0; i < children.length; i++) {
		const child = children[i];
		if (child != null) {
			mount(
				ids,
				commit,
				child,
				ancestorId,
				filters,
				domCache,
				config,
				profiler,
			);
		}
	}
}

export function resetChildren(
	commit: Commit,
	ids: IdMappingState,
	id: ID,
	vnode: VNode,
	filters: FilterState,
	config: RendererConfig10,
) {
	const children = getActualChildren(vnode);
	if (!children.length) return;

	const next = getFilteredChildren(vnode, filters, config);
	if (next.length < 2) return;

	commit.operations.push(
		MsgTypes.REORDER_CHILDREN,
		id,
		next.length,
		...next.map(x => getVNodeId(ids, x)),
	);
}

export function update(
	ids: IdMappingState,
	commit: Commit,
	vnode: VNode,
	ancestorId: number,
	filters: FilterState,
	domCache: WeakMap<HTMLElement | Text, VNode>,
	config: RendererConfig10,
	profiler: ProfilerState,
) {
	const skip = shouldFilter(vnode, filters, config);
	if (skip) {
		const children = getActualChildren(vnode);
		for (let i = 0; i < children.length; i++) {
			const child = children[i];
			if (child != null) {
				update(
					ids,
					commit,
					child,
					ancestorId,
					filters,
					domCache,
					config,
					profiler,
				);
			}
		}
		return;
	}

	if (!hasVNodeId(ids, vnode)) {
		mount(ids, commit, vnode, ancestorId, filters, domCache, config, profiler);
		return true;
	}

	const id = getVNodeId(ids, vnode);
	commit.operations.push(
		MsgTypes.UPDATE_VNODE_TIMINGS,
		id,
		(vnode.startTime || 0) * 1000,
		(vnode.endTime || 0) * 1000,
	);

	const oldVNode = getVNodeById(ids, id);
	updateVNodeId(ids, id, vnode);

	if (profiler.isProfiling && profiler.captureRenderReasons) {
		const reason = getRenderReason(oldVNode, vnode);
		if (reason !== null) {
			const count = reason.items ? reason.items.length : 0;
			commit.operations.push(MsgTypes.RENDER_REASON, id, reason.type, count);
			if (reason.items && count > 0) {
				commit.operations.push(
					...reason.items.map(str => getStringId(commit.strings, str)),
				);
			}
		}
	}

	const oldChildren = oldVNode
		? getActualChildren(oldVNode).map((v: any) => v && getVNodeId(ids, v))
		: [];

	let shouldReorder = false;

	const children = getActualChildren(vnode);
	for (let i = 0; i < children.length; i++) {
		const child = children[i];
		if (child == null) {
			if (oldChildren[i] != null) {
				commit.unmountIds.push(oldChildren[i]);
			}
		} else if (hasVNodeId(ids, child) || shouldFilter(child, filters, config)) {
			update(ids, commit, child, id, filters, domCache, config, profiler);
			// TODO: This is only sometimes necessary
			shouldReorder = true;
		} else {
			mount(ids, commit, child, id, filters, domCache, config, profiler);
			shouldReorder = true;
		}
	}

	if (shouldReorder) {
		resetChildren(commit, ids, id, vnode, filters, config);
	}
}

export function createCommit(
	ids: IdMappingState,
	roots: Set<VNode>,
	vnode: VNode,
	filters: FilterState,
	domCache: WeakMap<HTMLElement | Text, VNode>,
	config: RendererConfig10,
	profiler: ProfilerState,
): Commit {
	const commit = {
		operations: [],
		rootId: -1,
		strings: new Map(),
		unmountIds: [],
		renderReasons: new Map(),
	};

	let parentId = -1;

	const isNew = !hasVNodeId(ids, vnode);

	if (isRoot(vnode, config)) {
		parentId = -1;
		roots.add(vnode);
	} else {
		parentId = getVNodeId(ids, getAncestor(vnode)!);
	}

	if (isNew) {
		mount(ids, commit, vnode, parentId, filters, domCache, config, profiler);
	} else {
		update(ids, commit, vnode, parentId, filters, domCache, config, profiler);
	}

	commit.rootId = getVNodeId(ids, vnode);

	return commit;
}

const DEFAULT_FIlTERS: FilterState = {
	regex: [],
	type: new Set(["dom", "fragment"]),
};

export interface Preact10Renderer extends Renderer {
	onCommit(vnode: VNode): void;
	onUnmount(vnode: VNode): void;
}

export interface ProfilerState {
	isProfiling: boolean;
	captureRenderReasons: boolean;
}

export function createRenderer(
	port: PortPageHook,
	config: RendererConfig10,
	filters: FilterState = DEFAULT_FIlTERS,
): Preact10Renderer {
	const ids = createIdMappingState();
	const roots = new Set<VNode>();

	let currentUnmounts: number[] = [];

	const domToVNode = new WeakMap<HTMLElement | Text, VNode>();

	const profiler: ProfilerState = {
		isProfiling: false,
		captureRenderReasons: false,
	};

	return {
		// TODO: Deprecate
		// eslint-disable-next-line @typescript-eslint/no-empty-function
		flushInitial() {},

		startProfiling: options => {
			profiler.isProfiling = true;
			profiler.captureRenderReasons =
				!!options && !!options.captureRenderReasons;
		},
		stopProfiling: () => {
			profiler.isProfiling = false;
		},
		getVNodeById: id => getVNodeById(ids, id),
		has: id => hasId(ids, id),
		getDisplayName(vnode) {
			return getDisplayName(vnode, config);
		},
		getDisplayNameById: id => {
			const vnode = getVNodeById(ids, id);
			if (vnode) {
				return getDisplayName(vnode, config);
			}
			return "Unknown";
		},
		forceUpdate: id => {
			const vnode = getVNodeById(ids, id);
			if (vnode) {
				const c = getComponent(vnode);
				if (c) c.forceUpdate();
			}
		},
		log: (id, children) => logVNode(ids, config, id, children),
		inspect: id => inspectVNode(ids, config, id),
		findDomForVNode(id) {
			const vnode = getVNodeById(ids, id);
			if (!vnode) return null;

			const first = getDom(vnode);
			let last = null;
			if (typeof vnode.type === "function") {
				const children = getActualChildren(vnode);
				for (let i = children.length - 1; i >= 0; i--) {
					const child = children[i];
					if (child) {
						const dom = getDom(child);
						if (dom === first) break;
						if (dom !== null) {
							last = dom;
							break;
						}
					}
				}
			}

			return [first, last];
		},
		findVNodeIdForDom(node) {
			const vnode = domToVNode.get(node);
			if (vnode) {
				if (shouldFilter(vnode, filters, config)) {
					let p = vnode;
					let found = null;
					while ((p = getVNodeParent(p)) != null) {
						if (!shouldFilter(p, filters, config)) {
							found = p;
							break;
						}
					}

					if (found != null) {
						return getVNodeId(ids, found) || -1;
					}
				} else {
					return getVNodeId(ids, vnode) || -1;
				}
			}

			return -1;
		},
		refresh() {
			this.applyFilters(filters);
		},
		applyFilters(nextFilters) {
			/** Queue events and flush in one go */
			const queue: BaseEvent<any, any>[] = [];

			roots.forEach(root => {
				const rootId = getVNodeId(ids, root);
				traverse(root, vnode => this.onUnmount(vnode));

				const commit: Commit = {
					operations: [],
					rootId,
					strings: new Map(),
					unmountIds: currentUnmounts,
				};

				const unmounts = flush(commit);
				if (unmounts) {
					currentUnmounts = [];
					queue.push(unmounts);
				}
			});

			filters.regex = nextFilters.regex;
			filters.type = nextFilters.type;

			roots.forEach(root => {
				const commit = createCommit(
					ids,
					roots,
					root,
					filters,
					domToVNode,
					config,
					profiler,
				);
				const ev = flush(commit);
				if (!ev) return;
				queue.push(ev);
			});

			this.flushInitial();
			queue.forEach(ev => port.send(ev.type, ev.data));
		},
		onCommit(vnode) {
			const commit = createCommit(
				ids,
				roots,
				vnode,
				filters,
				domToVNode,
				config,
				profiler,
			);

			commit.unmountIds.push(...currentUnmounts);
			currentUnmounts = [];
			const ev = flush(commit);
			if (!ev) return;

			port.send(ev.type as any, ev.data);
		},
		onUnmount(vnode) {
			if (!shouldFilter(vnode, filters, config)) {
				if (hasVNodeId(ids, vnode)) {
					currentUnmounts.push(getVNodeId(ids, vnode));
				}
			}

			if (typeof vnode.type !== "function") {
				const dom = getDom(vnode);
				if (dom != null) domToVNode.delete(dom);
			}

			removeVNodeId(ids, vnode);
		},
		update(id, type, path, value) {
			const vnode = getVNodeById(ids, id);
			if (vnode !== null) {
				if (typeof vnode.type === "function") {
					const c = getComponent(vnode);
					if (c) {
						if (type === "props") {
							vnode.props = setInCopy(
								(vnode.props as any) || {},
								path.slice(),
								value,
							);
						} else if (type === "state") {
							const res = setInCopy(
								(c.state as any) || {},
								path.slice(),
								value,
							);
							setNextState(c, res);
						} else if (type === "context") {
							// TODO: Investigate if we should disallow modifying context
							// from devtools and make it readonly.
							setIn((c.context as any) || {}, path.slice(), value);
						}

						c.forceUpdate();
					}
				}
			}
		},
	};
}
