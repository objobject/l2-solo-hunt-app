
import {monstersById} from "../../generated/indexes";

export interface MonsterDatum {
    id: number;
    name: string;
    level: number;
    xp: number;
    hp: number;
}

const constructMonstersData: () => MonsterDatum[] = () => {
    return Object.values(monstersById).map(mob => ({
        id: mob['monster_id'],
        name: mob['name'],
        level: mob['level'],
        xp: mob['xp_reward'],
        hp: mob['hp'],
    }))
}

export const MONSTERS_DATA: MonsterDatum[] = constructMonstersData();