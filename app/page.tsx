import { Scene3DProvider } from "@/lib/scene3d-context";
import { FiltersProvider } from "@/lib/filters-context";
import { Scene3DHost } from "@/components/scene3d/scene3d-host";
import { MapPanel } from "@/components/map/map-panel";
import { TopBar } from "@/components/topbar";
import { DemoBanner } from "@/components/demo-banner";
import { Sidebar } from "@/components/sidebar/sidebar";
import { Timeline } from "@/components/timeline/timeline";

export default function HomePage() {
  return (
    <FiltersProvider>
      <Scene3DProvider>
        <div className="flex h-screen flex-col">
          <TopBar />
          <DemoBanner />
          <div className="flex flex-1 flex-col overflow-hidden sm:flex-row">
            <Sidebar />
            <div className="flex flex-1 flex-col overflow-hidden pb-11 sm:pb-0">
              <div className="relative flex flex-1 flex-col overflow-hidden">
                <MapPanel />
                <Scene3DHost />
              </div>
              <Timeline />
            </div>
          </div>
        </div>
      </Scene3DProvider>
    </FiltersProvider>
  );
}
