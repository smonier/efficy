import {
  AddResources,
  Island,
  buildModuleFileUrl,
  jahiaComponent,
} from "@jahia/javascript-modules-library";
import BrokerNewOpportunityIsland from "./BrokerNewOpportunity.island.client";
import type { BrokerNewOpportunityComponentProps, BrokerNewOpportunityIslandProps } from "./types";
import classes from "./BrokerNewOpportunity.module.css";

const API_BASE_PATH = "/modules/efficy-service/api/v1";

export default jahiaComponent(
  {
    componentType: "view",
    nodeType: "efficycomponents:brokerNewOpportunity",
    name: "default",
    displayName: "Nouvelle opportunite",
  },
  (props: BrokerNewOpportunityComponentProps) => {
    const islandProps: BrokerNewOpportunityIslandProps = {
      title: props["jcr:title"]?.trim() || "",
      apiBasePath: API_BASE_PATH,
    };

    return (
      <>
        <AddResources type="css" resources={buildModuleFileUrl("dist/assets/style.css")} />
        <Island component={BrokerNewOpportunityIsland} props={islandProps} clientOnly>
          <div>...</div>
        </Island>
      </>
    );
  },
);
