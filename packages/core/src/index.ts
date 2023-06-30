import { JSXAttrValue, Module, Node, parse } from "@swc/core";
import { Visitor } from "@swc/core/Visitor";

type Output = Metadata & {
	items: Array<Item>;
};

type Metadata = {
	createdAt: string;
	source: string; // URL (if VCS) or filesystem path for the currently analyzed project
};

type Item = {
	name: string;
	module: string;
	version: string;
	type: "element" | "type" | "method" | "variable" | "unknown";
	args?:
		| {
				data: Record<string, unknown>;
				isSpread: boolean;
		  }
		| undefined;
	location: {
		file: string;
		line: number;
		column: number;
		module: string;
	};
};

type PrimitiveValue = string | boolean | undefined | null | bigint | number;

const getUnsupportedValue = (node: Node) => `#${node.type}`;

const getLiteralValue = (node: JSXAttrValue | undefined): PrimitiveValue => {
	if (!node) {
		return true;
	}

	if (node.type === "NullLiteral") {
		return null;
	}

	if (
		node.type === "StringLiteral" ||
		node.type === "NumericLiteral" ||
		node.type === "BigIntLiteral" ||
		node.type === "BooleanLiteral" ||
		node.type === "JSXText"
	) {
		return node.value;
	}

	if (node.type === "JSXExpressionContainer") {
		return getLiteralValue(node.expression as JSXAttrValue);
	}

	return getUnsupportedValue(node);
};

const getLocation = (content: string, offset: number) => {
	const linesTillOffset = content.substring(0, offset).split(/\n/);
	const line = linesTillOffset.length;
	const column = (linesTillOffset[line - 1] as string).length;

	return {
		line,
		column,
	};
};

const createVisitor = (source: string) => {
	const data: Array<Item> = [];
	const visitor = new Visitor();
	const imports = new Map<string, { module: string; name: string }>();
	const createItem = ({
		offset,
		module,
		name,
		type,
		args,
	}: Pick<Item, "module" | "name" | "args" | "type"> & {
		offset: number;
	}): Item => {
		return {
			name,
			type,
			module,
			version: "",
			args,
			location: {
				...getLocation(source, offset),
				file: import.meta.url,
				module: "",
			},
		};
	};

	visitor.visitTsType = (node) => {
		let typeValue = "";

		if (
			node.type === "TsTypeReference" &&
			node.typeName.type === "Identifier"
		) {
			typeValue = node.typeName.value;
		}

		if (
			node.type === "TsIndexedAccessType" &&
			node.objectType.type === "TsTypeReference" &&
			node.objectType.typeName.type === "Identifier"
		) {
			typeValue = node.objectType.typeName.value;
		}

		const importMetadata = imports.get(typeValue);

		if (!importMetadata) return node;

		data.push(
			createItem({
				offset: node.span.start,
				module: importMetadata.module,
				name: importMetadata.name,
				type: "type",
			})
		);

		return node;
	};

	visitor.visitImportDeclaration = (node) => {
		const module = node.source.value;

		node.specifiers.forEach((specifier) => {
			const specifierValue = specifier.local.value;

			imports.set(specifierValue, {
				// @ts-expect-error `imported` field is exposed by `ImportSpecifier` node (@todo: fix the typing issue in @swc/core)
				name: specifier.imported?.value || specifierValue,
				module,
			});
		});

		return node;
	};

	visitor.visitJSXOpeningElement = (node) => {
		if (node.name.type !== "Identifier") return node;

		const name = node.name.value;
		const importMetadata = imports.get(name);

		if (!importMetadata) return node;

		data.push(
			createItem({
				name: importMetadata.name,
				module: importMetadata.module,
				offset: node.span.start,
				type: "element",
				args: {
					isSpread: false,
					data: node.attributes.reduce<Record<string, unknown>>(
						(props, prop) => {
							if (
								prop.type !== "JSXAttribute" ||
								prop.name.type !== "Identifier"
							)
								return props;

							props[prop.name.value] = getLiteralValue(
								prop.value
							);

							return props;
						},
						{}
					),
				},
			})
		);

		return node;
	};

	return function visit(module: Module) {
		visitor.visitModule(module);

		return data;
	};
};

const scan = async () => {
	const module = await parse(EXAMPLE_SOLID, {
		syntax: "typescript",
		tsx: true,
	});

	const visit = createVisitor(EXAMPLE_SOLID);
	const items = visit(module);
	const output: Output = {
		createdAt: new Date().toISOString(),
		source: process.cwd(),
		items,
	};

	console.log(JSON.stringify(output, null, 2));
};

export const EXAMPLE_REACT = `import { Link as ChakraLink, Button, ButtonProps, type ChakraLinkProps } from '@chakra-ui/react'
export interface ButtonProps {
  children: string;
  test: ChakraLinkProps["plop"]
}
export const Button = (props: ButtonProps) => (
  <ChakraLink
    isExternal
    href="https://github.com/vercel/next.js/blob/canary/examples/with-chakra-ui"
    flexGrow={3}
    mx={2}
  >
    <Button width="100%" bgGradient="linear(to-tr, teal.300,yellow.400)" testVariable={myVariable}>
      {props.children}
    </Button>
  </ChakraLink>
)`;

export const EXAMPLE_SOLID = `import { render } from "solid-js/web";
import { createSignal } from "solid-js";

function Counter() {
  const [count, setCount] = createSignal(1);
  const increment = () => setCount(count() + 1);

  return (
    <button type="button" onClick={increment}>
      {count()} hello
    </button>
  );
}

render(() => <Counter />, document.getElementById("app")!);`;

scan();
