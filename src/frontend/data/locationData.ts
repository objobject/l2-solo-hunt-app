import {locationsByMonsterId, monstersById} from "../../generated/indexes";


type Location = {
    id: number;
    territoryPoints: [number, number][];
    totalArea: number;
    densityScore: number;
    areaColor: string;
    totalSpawnCount: number;
    monsters: {
        id: number;
        name: string;
        level: number;
        xp: number;
        hp: number;
        spawnCount: number;
    }[];
}

/**
 * This function is meant to properly map {@link locationsByMonsterId} data found in {@link indexes.ts}
 * file before frontend works on it. The shape of data should present list of territories and all monsters in them.
 * If data presents multiple territories of EXACT SAME shape for multiple monsters, the data should be merged into
 * one territory listing all monsters and their spawn count there.
 */
function constructLocationData(): Location[] {
    return Object.values(
        Object.values(locationsByMonsterId).flat()
            .map(location => {
                const territoryPoints = parseTerritoryPolygon(location['territory_points_json']);
                const totalArea = calculatePolygonArea(territoryPoints);
                const mob = monstersById[location['monster_id']];

                return {
                    territoryPoints,
                    totalArea,
                    monster: {
                        id: mob['monster_id'],
                        name: mob['name'],
                        level: mob['level'],
                        xp: mob['xp_reward'],
                        hp: mob['hp'],
                        spawnCount: location['count']
                    }
                }
            })
            .reduce((prev, curr) => {
                const { monster, ...rest } = curr;
                const key = JSON.stringify(curr.territoryPoints)
                if (!prev[key]) {
                    prev[key] = {
                        ...rest,
                        id: key,
                        monsters: [monster]
                    }
                } else {
                    prev[key].monsters.push(monster);
                }

                return prev;
            }, {})
    )
        .map((location, idx) => {
            const densityScore = location.totalArea / location.monsters.reduce((prev, curr) => prev + curr.spawnCount, 0);
            return {
                ...location,
                id: idx,
                areaColor: getAreaColor(densityScore),
                totalSpawnCount: location.monsters.reduce((prev, curr) => prev + curr.spawnCount, 0),
                densityScore,
            }
        });
}

function calculatePolygonArea(positions) {
    if (!Array.isArray(positions) || positions.length < 3) return 0;

    let sum = 0;
    const n = positions.length;

    for (let i = 0; i < n; i++) {
        const [y1, x1] = positions[i];
        const [y2, x2] = positions[(i + 1) % n]; // Wraps around to index 0 at the end
        sum += x1 * y2 - x2 * y1;
    }

    return Math.abs(sum) / 2;
}

function getAreaColor(area) {
    const minArea = 500_000;
    const maxArea = 2_000_000;

    // 1. Normalize and clamp between 0 and 1
    const t = Math.max(0, Math.min(1, (area - minArea) / (maxArea - minArea)));

    // 2. Calculate Red and Green channels
    const r = Math.round(255 * t);
    const g = Math.round(255 * (1 - t));
    const b = 0;

    // 3. Convert to Hex
    const toHex = (c) => c.toString(16).padStart(2, '0');

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function parseTerritoryPolygon(territoryJson) {
    if (!territoryJson) return null;

    try {
        let points = JSON.parse(territoryJson);
        if (!Array.isArray(points) || points.length === 0) return null;

        // Handle triple-nested arrays like [[[x, y, minZ, maxZ], ...]]
        if (Array.isArray(points[0]) && Array.isArray(points[0][0])) {
            points = points[0];
        }

        // Convert [X, Y, ...] -> [Y, X] and filter out consecutive duplicate vertices
        const coords = [];
        for (let i = 0; i < points.length; i++) {
            const [x, y] = points[i];
            if (typeof x !== 'number' || typeof y !== 'number') continue;

            const prev = coords[coords.length - 1];
            if (!prev || prev[0] !== y || prev[1] !== x) {
                coords.push([y, x]);
            }
        }

        // Remove closing point if it duplicates the first point
        if (
            coords.length > 1 &&
            coords[0][0] === coords[coords.length - 1][0] &&
            coords[0][1] === coords[coords.length - 1][1]
        ) {
            coords.pop();
        }

        // Need at least 3 distinct points to form a 2D area (otherwise it's just a line)
        if (coords.length < 3) return null;

        // Check if all points are collinear (area === 0)
        const area = Math.abs(
            coords.reduce((sum, [y1, x1], idx) => {
                const [y2, x2] = coords[(idx + 1) % coords.length];
                return sum + (x1 * y2 - x2 * y1);
            }, 0) / 2
        );

        if (area < 1) return null; // Skip flat lines

        return coords;
    } catch (e) {
        return null;
    }
}

export const LOCATION_DATA: Location[] = constructLocationData();