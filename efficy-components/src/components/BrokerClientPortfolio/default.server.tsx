import {
  AddResources,
  Island,
  buildModuleFileUrl,
  jahiaComponent,
} from "@jahia/javascript-modules-library";
import BrokerClientPortfolioIsland from "./BrokerClientPortfolio.island.client";
import type { BrokerClientPortfolioComponentProps, BrokerClientPortfolioIslandProps } from "./types";
import classes from "./BrokerClientPortfolio.module.css";

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
    nodeType: "efficycomponents:brokerClientPortfolio",
    name: "default",
    displayName: "Portefeuille Client",
  },
  (props: BrokerClientPortfolioComponentProps) => {
    const islandProps: BrokerClientPortfolioIslandProps = {
      title: props["jcr:title"]?.trim() || "",
      pageSize: toPositiveInt(props.pageSize),
      apiBasePath: API_BASE_PATH,
    };

    return (
      <>
        <AddResources type="css" resources={buildModuleFileUrl("dist/assets/style.css")} />
        <div className={classes.root}>
          <Island component={BrokerClientPortfolioIsland} props={islandProps} clientOnly>
            <div className={classes.loadingFallback}>...</div>
          </Island>
        </div>
      </>
    );
  },
);
