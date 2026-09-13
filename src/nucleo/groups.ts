/**
 * The five icon families a Nucleo account can hold. The wire names are not
 * self-consistent: the desktop app calls Micro Bold "mini" internally but the
 * endpoints spell it "micro", and the UI family is "axis" on the wire.
 */
export interface GroupDef {
	key: string;
	title: string;
	/** Path segment for the full-library endpoint. */
	database: string;
}

export const GROUPS: readonly GroupDef[] = [
	{ key: "axis", title: "Nucleo UI", database: "database-axis" },
	{ key: "core", title: "Nucleo Core", database: "database-core" },
	{ key: "micro", title: "Nucleo Micro Bold", database: "database-micro" },
	{ key: "sharp", title: "Nucleo Sharp", database: "database-sharp" },
	{ key: "pixel", title: "Nucleo Pixel", database: "database-pixel" },
] as const;

export const GROUP_KEYS = GROUPS.map((g) => g.key);

export function groupByKey(key: string): GroupDef | undefined {
	return GROUPS.find((g) => g.key === key);
}
