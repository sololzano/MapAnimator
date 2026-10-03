// Plain-language "where do I get this file?" steps, shown next to the import buttons.

function Steps({ items }: { items: string[] }) {
  return (
    <ol className="m-0 flex list-decimal flex-col gap-0.5 pl-5 text-[12.5px] leading-normal text-text-2">
      {items.map((s) => <li key={s}>{s}</li>)}
    </ol>
  );
}

function Heading({ children }: { children: string }) {
  return <div className="text-[13px] font-semibold text-text">{children}</div>;
}

export function TimelineHelp() {
  return (
    <div className="flex flex-col gap-2.5">
      <Heading>Google Timeline on Android</Heading>
      <Steps items={[
        'Open the phone’s Settings app.',
        'Tap Location › Location services › Timeline.',
        'Tap Export Timeline data, then Continue and Save.',
      ]} />
      <Heading>Google Timeline on iPhone</Heading>
      <Steps items={[
        'Open the Google Maps app.',
        'Tap your profile picture › Settings › Location & Privacy.',
        'Tap Export Timeline data, then Save to Files.',
      ]} />
      <p className="m-0 text-[12.5px] leading-normal text-text-2 text-pretty">
        Copy the file (<b className="text-text">Timeline.json</b> or <b className="text-text">location-history.json</b>) to this computer, for example with a USB cable, AirDrop or Quick Share.
        Older Google Takeout files (<b className="text-text">Records.json</b>, Semantic Location History) work too.
      </p>
    </div>
  );
}

export function GpxHelp() {
  return (
    <div className="flex flex-col gap-2.5">
      <Heading>GPX, KML or KMZ</Heading>
      <p className="m-0 text-[12.5px] leading-normal text-text-2 text-pretty">
        Most sport and navigation apps can export one: Strava, Komoot, Garmin Connect, Wikiloc and others (look for “Export GPX” on an activity or route). Google My Maps works too (Export to KML/KMZ).
      </p>
    </div>
  );
}
