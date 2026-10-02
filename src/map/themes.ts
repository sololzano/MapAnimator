import type { MapThemeId } from '../core/model';

export interface MapTheme {
  id: MapThemeId;
  name: string;
  dark: boolean;
  land: string;
  water: string;
  park: string;
  wood: string;
  roadMajor: string;
  roadMinor: string;
  roadCasing: string;
  building: string;
  boundary: string;
  ink: string;
  halo: string;
  waterInk: string;
  shadow: string;
  sky: string;
  /** Pastel fills for "All countries" region shading. */
  regions: string[];
}

const latteRegions = ['#dce8f8', '#e3f1dc', '#f7e7d4', '#ece0f7', '#f6dde3', '#d8eeec'];
const frappeRegions = ['#3e4a66', '#3f5145', '#55493f', '#4a4361', '#56434b', '#3b5355'];

export const MAP_THEMES: MapTheme[] = [
  {
    id: 'latte', name: 'Latte', dark: false, land: '#eceef3', water: '#b7d9ea', park: '#d5e8cf', wood: '#cfe2c6',
    roadMajor: '#ffffff', roadMinor: '#f7f8fa', roadCasing: '#ccd0da', building: '#dce0e8', boundary: '#8c8fa1',
    ink: '#4c4f69', halo: '#eff1f5', waterInk: '#209fb5', shadow: '#5c5f77', sky: '#c9e3f2', regions: latteRegions,
  },
  {
    id: 'frappe', name: 'Frappé', dark: true, land: '#303446', water: '#232634', park: '#36443f', wood: '#34413d',
    roadMajor: '#51576d', roadMinor: '#414559', roadCasing: '#292c3c', building: '#3a3f52', boundary: '#838ba7',
    ink: '#c6d0f5', halo: '#303446', waterInk: '#85c1dc', shadow: '#1b1d27', sky: '#414559', regions: frappeRegions,
  },
  {
    id: 'paper', name: 'Paper', dark: false, land: '#efebe0', water: '#c6dadd', park: '#e0e4cc', wood: '#d9dfc3',
    roadMajor: '#ffffff', roadMinor: '#f7f4ec', roadCasing: '#dcd6c4', building: '#e2ddcf', boundary: '#8d8a7e',
    ink: '#3f3e3a', halo: '#efebe0', waterInk: '#4f7a80', shadow: '#5d584a', sky: '#d6e6e8', regions: latteRegions,
  },
  {
    id: 'mono', name: 'Mono', dark: false, land: '#e7e6e2', water: '#cdcdc8', park: '#deddd8', wood: '#dad9d4',
    roadMajor: '#f9f9f7', roadMinor: '#f2f2ef', roadCasing: '#cfcec9', building: '#d9d8d3', boundary: '#8a8984',
    ink: '#33332f', halo: '#e7e6e2', waterInk: '#6b6b66', shadow: '#55554f', sky: '#dcdcd8', regions: ['#dcdcd8', '#d3d3cf', '#e2e2de', '#d8d8d4', '#cfcfcb', '#e6e6e2'],
  },
  {
    id: 'terrain', name: 'Terrain', dark: false, land: '#dce1c4', water: '#a8cad8', park: '#c9d4a8', wood: '#bfcd9c',
    roadMajor: '#f6f2e6', roadMinor: '#ece8da', roadCasing: '#b9b79e', building: '#cfcfb6', boundary: '#6f7556',
    ink: '#38431f', halo: '#dce1c4', waterInk: '#3e6c80', shadow: '#4a4f33', sky: '#cfe1e8', regions: latteRegions,
  },
  {
    id: 'satellite', name: 'Satellite', dark: true, land: '#56654a', water: '#2c4658', park: '#56654a', wood: '#56654a',
    roadMajor: 'rgba(255,255,255,0.55)', roadMinor: 'rgba(255,255,255,0.3)', roadCasing: 'rgba(0,0,0,0)', building: 'rgba(0,0,0,0)', boundary: 'rgba(244,242,232,0.7)',
    ink: '#f4f2e8', halo: 'rgba(20,20,19,0.8)', waterInk: '#d7ecf5', shadow: '#000000', sky: '#9ab7cf', regions: frappeRegions,
  },
  {
    id: 'night', name: 'Night', dark: true, land: '#2a2a27', water: '#141413', park: '#2f332b', wood: '#2d312a',
    roadMajor: '#45453f', roadMinor: '#3a3a35', roadCasing: '#1f1f1d', building: '#33332f', boundary: '#77756b',
    ink: '#d4d2c6', halo: '#2a2a27', waterInk: '#8f8d84', shadow: '#000000', sky: '#3a3a35', regions: frappeRegions,
  },
  {
    id: 'blueprint', name: 'Blueprint', dark: true, land: '#27496d', water: '#1a3452', park: '#2b5077', wood: '#2b5077',
    roadMajor: 'rgba(226,236,247,0.45)', roadMinor: 'rgba(226,236,247,0.25)', roadCasing: 'rgba(0,0,0,0)', building: 'rgba(226,236,247,0.12)', boundary: 'rgba(226,236,247,0.7)',
    ink: '#e2ecf7', halo: '#27496d', waterInk: '#b7cde6', shadow: '#0e1f33', sky: '#35608c', regions: ['#2f5680', '#2a4e74', '#335c88', '#2c5179', '#31597f', '#284a6f'],
  },
];

export function mapTheme(id: MapThemeId): MapTheme {
  return MAP_THEMES.find((t) => t.id === id) ?? MAP_THEMES[0];
}
