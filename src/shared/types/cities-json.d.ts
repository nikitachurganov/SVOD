declare module 'cities.json' {
  interface CityJsonEntry {
    name: string;
    country: string;
    lat?: string;
    lng?: string;
    admin1?: string;
    admin2?: string;
  }

  const cities: CityJsonEntry[];
  export default cities;
}
