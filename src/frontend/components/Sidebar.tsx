import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom'
import { Drawer, Popover } from "@ninna-ui/overlays";
import { Button , Code, IconButton, Badge  } from "@ninna-ui/primitives";
import { CheckboxGroup, CheckboxGroupItem, Input, Checkbox} from "@ninna-ui/forms";
import { ArrowLeftFromLine, ArrowRightFromLine,
    ChevronDown,  Check,
    ChevronUp} from "lucide-react";
import { MONSTERS_DATA } from '../data/monstersData'

type MultiSelectProp = 'monsters';

const monstersById = MONSTERS_DATA.reduce((dict, mob) => {
    dict[mob.id] = mob;
    return dict;
}, {});

export function Sidebar() {
    const [isExpanded, setExpanded] = useState<boolean>(false);
    const [selected, setSelected] = useState<Record<MultiSelectProp, Set<string>>>({
        monsters: new Set()
    });
    const [params, setParams] = useSearchParams();

    const toggleOption = useCallback((prop: MultiSelectProp, value: string) => {
        setSelected((prev) => {
            const next = new Set(prev[prop]);
            if (next.has(value)) next.delete(value);
            else next.add(value);
            return { ...prev, [prop]: next };
        });
    }, []);


    useEffect(() => {
        setSelected(selected => {
            const newSelected = {...selected};

            Object.keys(selected).forEach(key => {
                if (params.has(key)) {
                    newSelected[key] = params.get(key).split(',').reduce((set, id) => {
                        set.add(id);
                        return set;
                    }, new Set());
                }
            });

            return newSelected;
        })
    }, []);

    useEffect(() => {
        const url = new URL(window.location.href);

        Object.keys(selected).forEach(key => {
            if (selected[key].size === 0) {
                setParams({monsters: undefined});
            } else {
                setParams({monsters:Array.from(selected[key]).join(',') })
            }
        });

        // Updates URL without reloading the page or cluttering
    }, [selected]);

    return (
        <Drawer modal={false} open={isExpanded}>
            <Drawer.Trigger asChild  className="absolute top-0 right-0">
                <IconButton
                    onClick={() => setExpanded(!isExpanded)}
                    icon={<ArrowLeftFromLine />}
                    color="primary"
                    aria-label="Like"
                />
            </Drawer.Trigger>
            <Drawer.Content closeOnOverlayClick={false} className="bg-white">
                <Drawer.Header className="flex justify-end w-full">
                    <IconButton
                        onClick={() => setExpanded(!isExpanded)}
                        icon={<ArrowRightFromLine />}
                        color="primary"
                        aria-label="Like"
                    />
                </Drawer.Header>
                <Drawer.Body>
                    <SearchableMultiSelect
                        label="monsters"
                        options={MONSTERS_DATA.map(mob => ({
                            label: mobName(mob),
                            value: mob.id
                        }))}
                        selected={selected.monsters}
                        onToggle={(v) => toggleOption('monsters', v)}
                    />
                </Drawer.Body>
                <Drawer.Footer>
                    <Drawer.Close asChild>
                        <Button variant="ghost">Cancel</Button>
                    </Drawer.Close>
                    <Button>Save</Button>
                </Drawer.Footer>
            </Drawer.Content>
        </Drawer>
    )
}

function mobName(mob: { name: string; level: number }) {
    return `${mob.name} (lv. ${mob.level})`;
}

export function SearchableMultiSelect({
    label,
    onToggle,
    options,
    selected
                                      }) {
    const MAX_VISIBLE = 2;
    const [search, setSearch] = useState('');

    const filteredOptions = options.filter(({label, value}) =>
        label.toLowerCase().includes(search.toLowerCase())
    );

    const toggleOption = (option: string) => {
        setSelected((prev) =>
            prev.includes(option) ? prev.filter((item) => item !== option) : [...prev, option]
        );
    };

    const selectedArr = Array.from(selected);

    const visibleItems = selectedArr.slice(0, MAX_VISIBLE);
    const remainingCount = selectedArr.length - MAX_VISIBLE;

    return (
        <Popover>
            <Popover.Trigger asChild>
                <Button variant="outline" className="w-72 justify-start flex-wrap gap-1 h-auto min-h-10">
                    {selectedArr.length === 0 ? (
                        <span className="text-gray-500">Search {label}...</span>
                    ) : (
                        <>
                            {visibleItems.map((item) => (
                                <Badge key={item} variant="secondary">
                                    {mobName(monstersById[item])}
                                </Badge>
                            ))}
                            {remainingCount > 0 && (
                                <Badge variant="outline" className="text-xs">
                                    and {remainingCount} more
                                </Badge>
                            )}
                        </>
                    )}
                </Button>
            </Popover.Trigger>

            <Popover.Content className="w-72 p-2 space-y-2">
                <Input
                    placeholder={`Search ${label}...`}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <div className="max-h-48 overflow-y-auto space-y-1">
                    {filteredOptions.map(({label, value}) => (
                        <label key={value} className="flex items-center gap-2 p-1.5 rounded cursor-pointer hover:bg-gray-100">
                            <Checkbox
                                checked={selectedArr.includes(value)}
                                onCheckedChange={() => onToggle(value)}
                            />
                            <span className="text-sm">{label}</span>
                        </label>
                    ))}
                </div>
            </Popover.Content>
        </Popover>
    );
}