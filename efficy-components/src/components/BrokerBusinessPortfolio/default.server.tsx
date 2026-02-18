import {
  AddResources,
  Island,
  buildModuleFileUrl,
  jahiaComponent,
} from "@jahia/javascript-modules-library";
import BrokerBusinessPortfolioIsland from "./BrokerBusinessPortfolio.island.client";
import type { BrokerBusinessPortfolioComponentProps, BrokerBusinessPortfolioIslandProps } from "./types";
import classes from "./BrokerBusinessPortfolio.module.css";

const DEFAULT_PAGE_SIZE = 10;
const API_BASE_PATH = "/modules/efficy-service/api/v1";

function toPositiveInt(value: number | string | undefined): number {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }

  return DEFAULT_PAGE_SIZE;
}

export default jahiaComponent(
  {
    componentType: "view",
    nodeType: "efficycomponents:brokerBusinessPortfolio",
    name: "default",
    displayName: "Portefeuille Affaires",
  },
  (props: BrokerBusinessPortfolioComponentProps) => {
    const islandProps: BrokerBusinessPortfolioIslandProps = {
      title: props["jcr:title"]?.trim() || "",
      pageSize: toPositiveInt(props.pageSize),
      apiBasePath: API_BASE_PATH,
    };

    return (
      <>
        <AddResources type="css" resources={buildModuleFileUrl("dist/assets/style.css")} />
        <Island component={BrokerBusinessPortfolioIsland} props={islandProps} clientOnly>
          <div>...</div>
        </Island>
      </>
    );
  },
);
