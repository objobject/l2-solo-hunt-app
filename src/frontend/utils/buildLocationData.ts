import {locationsByMonsterId, monstersById} from "../../generated/indexes.js";

export const buildLocationData = () => {
    const territories = Object.values(locationsByMonsterId).map((locations) => {
        const staticSpawns = locations.filter(loc => loc["spawn_x"] !== null);
        const territorySpawns = locations.filter(loc => loc["spawn_x"] == null);
        const monster = monstersById[locations[0]['monster_id']];

        return {
            monster,
            spawnLocations: staticSpawns.map((loc) => ({ x: loc['spawn_x'], y: loc['spawn_y']})),
            territories: territorySpawns.length === 0 ? null : territorySpawns.map(loc => {
                return {
                    locIndex: loc['location_index'],
                    spawnCount: loc['count'],
                    territoryShape: parseTerritoryPolygon(loc['territory_points_json'])
                };
            })
        }
    });
    return territories;
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