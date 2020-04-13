import { ObjPath } from "./ElementProps";

export type PropDataType =
	| "boolean"
	| "string"
	| "number"
	| "array"
	| "map"
	| "set"
	| "object"
	| "null"
	| "undefined"
	| "function"
	| "bigint"
	| "vnode"
	| "blob"
	| "symbol"
	| "__meta__";

export interface PropData {
	id: string;
	type: PropDataType;
	value: any;
	path: ObjPath;
	editable: boolean;
	collapsable: boolean;
	depth: number;
	meta: any;
	children: string[];
}

export function parseProps(
	data: any,
	path: ObjPath,
	limit: number,
	transform: (data: PropData) => PropData,
	out: Map<string, PropData>,
): Map<string, PropData> {
	const depth = path.length > 0 ? path.length - 1 : 0;
	const pathStr = path.join(".");

	if (path.length > limit) {
		return out;
	}

	if (Array.isArray(data)) {
		const children: string[] = [];
		out.set(
			path.join("."),
			transform({
				depth,
				id: pathStr,
				type: "array",
				collapsable: data.length > 0,
				editable: false,
				path,
				meta: null,
				value: data,
				children,
			}),
		);
		data.forEach((item, i) => {
			const childPath = path.concat(i);
			children.push(childPath.join("."));
			parseProps(item, childPath, limit, transform, out);
		});
	} else if (data instanceof Set) {
		// TODO: We're dealing with serialized data here, not a Set object
		out.set(
			pathStr,
			transform({
				depth,
				id: pathStr,
				type: "set",
				collapsable: false,
				editable: false,
				path,
				value: "Set",
				children: [],
				meta: null,
			}),
		);
	} else if (typeof data === "object") {
		if (data === null) {
			out.set(
				pathStr,
				transform({
					depth,
					id: pathStr,
					type: "null",
					collapsable: false,
					editable: false,
					path,
					value: data,
					children: [],
					meta: null,
				}),
			);
		} else {
			const maybeCustom = Object.keys(data).length === 2;
			// Functions are encoded as objects
			if (
				maybeCustom &&
				typeof data.name === "string" &&
				data.type === "function"
			) {
				out.set(
					pathStr,
					transform({
						depth,
						id: pathStr,
						type: "function",
						collapsable: false,
						editable: false,
						path,
						value: data,
						children: [],
						meta: null,
					}),
				);
			} else if (
				// Same for vnodes
				maybeCustom &&
				typeof data.name === "string" &&
				data.type === "vnode"
			) {
				out.set(
					pathStr,
					transform({
						depth,
						id: pathStr,
						type: "vnode",
						collapsable: false,
						editable: false,
						path,
						value: data,
						children: [],
						meta: null,
					}),
				);
			} else if (
				// Same for Set
				maybeCustom &&
				typeof data.name === "string" &&
				data.type === "set"
			) {
				out.set(
					pathStr,
					transform({
						depth,
						id: pathStr,
						type: "set",
						collapsable: false,
						editable: false,
						path,
						value: data,
						children: [],
						meta: null,
					}),
				);
			} else if (
				// Same for Map
				maybeCustom &&
				typeof data.name === "string" &&
				data.type === "map"
			) {
				out.set(
					pathStr,
					transform({
						depth,
						id: pathStr,
						type: "map",
						collapsable: false,
						editable: false,
						path,
						value: data,
						children: [],
						meta: null,
					}),
				);
			} else if (
				// Same for Blobs
				maybeCustom &&
				typeof data.name === "string" &&
				data.type === "blob"
			) {
				out.set(
					pathStr,
					transform({
						depth,
						id: pathStr,
						type: "blob",
						collapsable: false,
						editable: false,
						path,
						value: data,
						children: [],
						meta: null,
					}),
				);
			} else if (data.name === "__meta__") {
				const res = parseProps(data.value, path, limit + 1, transform, out);
				const node = res.get(path.join("."));
				if (node) {
					node.meta = data.meta;
				}
			} else {
				// Check if
				const node: PropData = {
					depth,
					id: pathStr,
					type: "object",
					collapsable: Object.keys(data).length > 0,
					editable: false,
					path,
					value: data,
					children: [],
					meta: null,
				};
				out.set(pathStr, node);

				Object.keys(data).forEach(key => {
					const nextPath = path.concat(key);
					node.children.push(nextPath.join("."));
					parseProps(data[key], nextPath, limit, transform, out);
				});

				out.set(pathStr, transform(node));
			}
		}
	} else {
		const type = typeof data;
		out.set(
			pathStr,
			transform({
				depth,
				id: pathStr,
				type: type as any,
				collapsable: false,
				editable: type !== "undefined" && data !== "[[Circular]]",
				path,
				value: data,
				children: [],
				meta: null,
			}),
		);
	}

	return out;
}
