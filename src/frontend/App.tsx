import {Map} from './components/Map';
import { Sidebar } from './components/Sidebar';
import { Root, Main, Panel } from '@atlaskit/navigation-system/layout';
import './styles/App.css'
import {LOCATION_DATA} from "./data/locationData";
export default function App() {
    return (
        <main className="main-content">
            <Map/>
            <Sidebar/>
        </main>
    )
}
