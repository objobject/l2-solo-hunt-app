import {calculateMagicalDamage, calculatePhysicalDamage, MagicalShotType, PhysicalShotType} from "./combat.js";
import {monsters} from "../../generated/monsters.js";

const PLAYER_TEST_STATS: PlayerInputStats = {
    level: 14,
    magicAttack: 28,
    physAttack: 16,
    skillPower: 21,
    skillMp: 15,
    allowedMaxAutoAttacks: 99,
    allowedLevelDifference: [-99, 96],
    shotType: 'spiritshot' as MagicalShotType,
    physShotType: 'none' as PhysicalShotType,
    combatType: 'attack_only'
};

type PlayerInputStats = {
    level: number,
    magicAttack: number;
    physAttack: number;
    skillPower: number;
    skillMp: number;
    allowedMaxAutoAttacks: number;
    allowedLevelDifference: [number, number];
    shotType: MagicalShotType;
    physShotType: PhysicalShotType;
    combatType: 'spells' | 'attack_only'
}

type MonsterInputStats = {
    hp: number;
    magicDefense: number;
    physDefense: number;
}

type VersusResults = {
    skillHitsRequired: number;
    lastHitsRequired: number;
    manaUsed: number;
}

const versus = (player: PlayerInputStats, monster: MonsterInputStats): VersusResults => {
    let skillHitsRequired = 0;
    let lastHitsRequired = 0;

    const skillDmg = calculateMagicalDamage({
        monsterMagicalDefense: monster.magicDefense,
        magicalAttack: player.magicAttack,
        skillPower: player.skillPower,
        shotType: player.shotType
    });

    const attackDamage = calculatePhysicalDamage({
        playerLevel: player.level,
        monsterPhysicalDefense: monster.physDefense,
        physicalAttack: player.physAttack,
        skillPower: 1,
        shotType: player.physShotType
    });

    if (player.combatType === 'spells') {
        skillHitsRequired = Math.trunc(monster.hp / skillDmg.damage);
        lastHitsRequired = 0;

        const monsterHpAfterSkills = monster.hp - (skillHitsRequired * skillDmg.damage);

        if (monsterHpAfterSkills >= 0) {
            lastHitsRequired = monsterHpAfterSkills / attackDamage.damage;

            if (lastHitsRequired > player.allowedMaxAutoAttacks) {
                skillHitsRequired += 1;
                lastHitsRequired = 0;
            }
        }
    }
    if (player.combatType === 'attack_only') {
        lastHitsRequired = Math.ceil(monster.hp / attackDamage.damage);
    }

    return {
        skillHitsRequired,
        lastHitsRequired: Math.ceil(lastHitsRequired),
        manaUsed: skillHitsRequired * player.skillMp
    }
}


console.table(monsters.filter(monster => {
    const monLevel = monster['level'];

    const withinLevel = monLevel >= PLAYER_TEST_STATS.level + PLAYER_TEST_STATS.allowedLevelDifference[0] && monLevel <= PLAYER_TEST_STATS.level + PLAYER_TEST_STATS.allowedLevelDifference[1];

    return withinLevel;
}).map(monster => {
    const versusResults = versus(PLAYER_TEST_STATS, {
        magicDefense: monster['magic_defense'],
        physDefense: monster['physical_defense'],
        hp: monster['hp']
    })
    return {
        monster_raw: monster,
        monster: monster['name'],
        monsterSpeed: monster['speed'],
        xpPerHit: monster['xp_reward'] / versusResults.lastHitsRequired,
        xpPerMana: monster['xp_reward'] / versusResults.manaUsed,
        ...versusResults
    }
})
    .filter(i => {
        if (PLAYER_TEST_STATS.combatType === 'attack_only') {
            return i.lastHitsRequired <= PLAYER_TEST_STATS.allowedMaxAutoAttacks;
        }

        return true;
    })
    .toSorted((a, b) => {
    if (PLAYER_TEST_STATS.combatType === 'spells') {
        return a.xpPerMana - b.xpPerMana || b.monster_raw['speed'] - a.monster_raw['speed'];
    }
    if (PLAYER_TEST_STATS.combatType === 'attack_only') {
        return a.xpPerHit - b.xpPerHit;
    }

    return 1;
}));