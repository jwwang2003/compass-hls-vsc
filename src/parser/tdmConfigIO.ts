import * as yaml from "js-yaml";

import { normalizeConfig, type TdmConfigSchema } from "./tdmConfigModel";

export function cloneConfig(config: TdmConfigSchema): TdmConfigSchema {
    return JSON.parse(JSON.stringify(config)) as TdmConfigSchema;
}

export function serializeConfig(config: TdmConfigSchema): string {
    return yaml.dump(normalizeConfig(config), { indent: 4, sortKeys: false });
}
