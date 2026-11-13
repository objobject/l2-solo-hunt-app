import { useState, useMemo } from 'react';
import { MapContainer, ImageOverlay, SVGOverlay, Marker, Polygon, Tooltip } from 'react-leaflet';
import L, { LatLngBounds } from 'leaflet';
import { createLayerComponent } from '@react-leaflet/core';
import { buildLocationData } from './utils/buildLocationData'
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

import overlayImage from './static/world-map.jpg';

const modules = import.meta.glob('./static/tiles/*.png', { eager: true });

const TILE_SIZE = 32768;
const ORIGIN_X = 20;
const ORIGIN_Y = 18;

const MIN_X = -131072; // West edge of Tile 16 (Talking Island)
const MAX_X =  196608; // East edge of Tile 25 (Eastern coast)
const MIN_Y =  -32768; // North edge of Tile 17 (Border Outpost / Tower of Insolence)
const MAX_Y =  262144; // South edge of Tile 25 (Southern Sea)

const IMG_WIDTH  = 1642;
const IMG_HEIGHT = 1476;

const tileUrls = {};
for (const path in modules) {
    const match = path.match(/(\d+_\d+)_2048\.png$/);
    if (match) {
        tileUrls[match] = modules[path].default;
    }
}

const tiles = Object.entries(tileUrls).map(([key, url]) => {
    const [tileX, tileY] = key.split('_').map(Number);

    console.log(tileX, tileY)

    const minX = (tileX - ORIGIN_X) * TILE_SIZE;
    const maxX = minX + TILE_SIZE;

    const minY = (tileY - ORIGIN_Y) * TILE_SIZE;
    const maxY = minY + TILE_SIZE;

    return {
        key,
        url,
        // Zaneguj Y (-maxY oraz -minY), aby północ była na górze, a południe na dole!
        bounds: [[maxY, minX], [minY, maxX]]
    };
});

const TERRITORY_STYLE = {
    color: '#ff9800',       // Border outline color
    weight: 1,            // Border thickness in pixels
    opacity: 1,           // Border opacity
    fillColor: '#ff9800',   // Polygon interior color
    fillOpacity: 0.5,      // Semi-transparent fill (25%)
};

const scaleX = IMG_WIDTH  / (MAX_X - MIN_X);
const scaleY = IMG_HEIGHT / (MAX_Y - MIN_Y);

const L2CRS = L.extend({}, L.CRS.Simple, {
    transformation: new L.Transformation(
        scaleX,
        -MIN_X * scaleX,
        scaleY,
        -MIN_Y * scaleY
    )
});

const mapBounds = [
    [MAX_Y, MIN_X], // Bottom-Left corner
    [MIN_Y, MAX_X]  // Top-Right corner
];

export default function App() {
    const [showSpawns, setShowSpawns] = useState<boolean>(true);
    const locationData = buildLocationData();

    const renderedMarkers = useMemo(() => {
        return locationData.filter(loc => {
            const withinLevelRange = loc.monster.level >= 17 && loc.monster.level <= 24
            return withinLevelRange;
        }).map(loc => {
            return loc.spawnLocations.map(spawn => (
                <Marker position={[spawn.y, spawn.x]}>
                    <Tooltip sticky>
                        <div>Monster: {loc.monster['name']}</div>
                    </Tooltip>
                </Marker>
            ))
        })
    }, [locationData]);

    const renderedTerritories = useMemo(() => {
        return locationData.filter(loc => {
            const hasTerritories = !!loc.territories;
            const withinLevelRange = loc.monster.level >= 1 && loc.monster.level <= 99
            return hasTerritories && withinLevelRange;
        }).map(loc => {
            return loc.territories.map(({territoryShape, spawnCount, locIndex}, idx) => {
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
                    const minArea = 50000;
                    const maxArea = 8_000_000;

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

                const area = calculatePolygonArea(territoryShape);
                const densityScore = area / spawnCount;
                let shapeColor = getAreaColor(densityScore)

                return (
                    <Polygon
                        key={`${loc.monster['monster_id']}-${locIndex}-${shapeColor}`}
                        positions={territoryShape}
                        pathOptions={{
                            weight: 1,
                            opacity: 1,
                            fillOpacity: 0.1,
                            color: shapeColor,
                            fillColor: shapeColor
                        }}
                    >
                        <Tooltip sticky>
                            <div>Monster: {loc.monster['name']}</div>
                            <div>Spawns: {spawnCount}</div>
                            <div>Score: {Math.round(densityScore).toLocaleString()}</div>
                        </Tooltip>
                    </Polygon>
                )
            })
        })
    }, [locationData])

    return (
        <MapContainer
            bounds={mapBounds}
            style={{ height: '100%', width: '100%' }}
            crs={L2CRS}
            minZoom={-5}
            maxZoom={6}
        >
            <ImageOverlay
                url={"/world-map.jpg"}
                bounds={mapBounds}
                zIndex={10}
            />
            {tiles.map((tile) => (
                <ImageOverlay zIndex={11} key={tile.key} url={tile.url} bounds={tile.bounds} />
            ))}
            {
                showSpawns && (
                    <MarkerClusterGroup
                        chunkedLoading={true}
                        maxClusterRadius={50}
                        spiderfyOnMaxZoom={true}
                        showCoverageOnHover={false}
                    >
                        {
                            renderedMarkers
                        }
                    </MarkerClusterGroup>
                )
            }
            {renderedTerritories}
        </MapContainer>
    )
}

const MarkerClusterGroup = createLayerComponent(
    function createMarkerCluster({ children: _c, ...options }, ctx) {
        const clusterProps = {};
        const clusterEvents = {};

        // Separate event listeners (onClusterClick, etc.) from options
        Object.entries(options).forEach(([key, value]) => {
            if (key.startsWith('on')) {
                clusterEvents[key] = value;
            } else {
                clusterProps[key] = value;
            }
        });

        const instance = L.markerClusterGroup(clusterProps);

        // Attach events
        Object.entries(clusterEvents).forEach(([eventAsProp, callback]) => {
            const clusterEvent = `cluster${eventAsProp.slice(2).toLowerCase()}`;
            instance.on(clusterEvent, callback);
        });

        return {
            instance,
            context: { ...ctx, layerContainer: instance },
        };
    }
);

function gameCoordsToTile(gameX, gameY) {
    const tileX = Math.floor(gameX / TILE_SIZE) + ORIGIN_X;
    const tileY = Math.floor(gameY / TILE_SIZE) + ORIGIN_Y;
    return { tileX, tileY, tileName: `${tileX}_${tileY}` };
}

function tileToGameBounds(tileX, tileY) {
    const minX = (tileX - ORIGIN_X) * TILE_SIZE;
    const maxX = minX + TILE_SIZE;

    const minY = (tileY - ORIGIN_Y) * TILE_SIZE;
    const maxY = minY + TILE_SIZE;

    return { minX, maxX, minY, maxY };
}

