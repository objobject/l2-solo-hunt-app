import {Map} from './components/Map';

import './styles/App.css'
import {LOCATION_DATA} from "./data/locationData";
export default function App() {

    console.log(LOCATION_DATA.filter(loc => loc.monsters.some(s => s.name.includes("Turek"))))
    return (
        <main className="main-content">
            <Map/>
        </main>
    )
}
