import { h } from "preact";
import { useState, useCallback } from "preact/hooks";
import { DataInput } from "../../DataInput";
import s from "./NewProp.css";
import s2 from "./ElementProps.css";

export interface NewPropProps {
	onChange: (value: any, path: string) => void;
}

export function NewProp(props: NewPropProps) {
	const [name, setName] = useState("");

	const onChangeName = useCallback((e: Event) => {
		setName((e.target as any).value);
	}, []);

	const onCommit = useCallback(
		(value: any) => {
			if (name) {
				props.onChange(value, name);
				setName("");
			}
		},
		[name],
	);

	return (
		<div class={s.root}>
			<div class={`${s2.name} ${s.nameWrapper}`}>
				<input
					name="new-prop-name"
					type="text"
					placeholder="new prop"
					class={`${s2.nameInput} ${s.name}`}
					value={name}
					onInput={onChangeName}
				/>
			</div>
			<DataInput
				class={s.value}
				value={undefined}
				onChange={onCommit}
				placeholder="new value"
				name="foobar"
			/>
		</div>
	);
}
