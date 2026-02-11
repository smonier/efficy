package org.jahia.se.modules.efficy.service.config;

import org.osgi.service.component.annotations.Activate;
import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Modified;

import java.util.Map;

@Component(service = EfficyServiceConfiguration.class, configurationPid = EfficyServiceConfiguration.PID, immediate = true)
public class EfficyServiceConfiguration {

    public static final String PID = "org.jahia.se.modules.efficy.service";

    private volatile Snapshot snapshot = Snapshot.empty();

    @Activate
    @Modified
    protected void activate(Map<String, Object> properties) {
        snapshot = Snapshot.from(properties);
    }

    public String getServer() {
        return snapshot.server;
    }

    public String getAppContext() {
        return snapshot.appContext;
    }

    public String getVersion() {
        return snapshot.version;
    }

    public String getToken() {
        return snapshot.token;
    }

    public String getAdvancedResource() {
        return snapshot.advancedResource;
    }

    public String getBaseResource() {
        return snapshot.baseResource;
    }

    public String getServiceResource() {
        return snapshot.serviceResource;
    }

    public int getConnectTimeoutMs() {
        return snapshot.connectTimeoutMs;
    }

    public int getReadTimeoutMs() {
        return snapshot.readTimeoutMs;
    }

    public int getMaxPageSize() {
        return snapshot.maxPageSize;
    }

    public boolean isForwardClientAuthorization() {
        return snapshot.forwardClientAuthorization;
    }

    private static final class Snapshot {
        private final String server;
        private final String appContext;
        private final String version;
        private final String token;
        private final String advancedResource;
        private final String baseResource;
        private final String serviceResource;
        private final int connectTimeoutMs;
        private final int readTimeoutMs;
        private final int maxPageSize;
        private final boolean forwardClientAuthorization;

        private Snapshot(String server,
                         String appContext,
                         String version,
                         String token,
                         String advancedResource,
                         String baseResource,
                         String serviceResource,
                         int connectTimeoutMs,
                         int readTimeoutMs,
                         int maxPageSize,
                         boolean forwardClientAuthorization) {
            this.server = server;
            this.appContext = appContext;
            this.version = version;
            this.token = token;
            this.advancedResource = advancedResource;
            this.baseResource = baseResource;
            this.serviceResource = serviceResource;
            this.connectTimeoutMs = connectTimeoutMs;
            this.readTimeoutMs = readTimeoutMs;
            this.maxPageSize = maxPageSize;
            this.forwardClientAuthorization = forwardClientAuthorization;
        }

        private static Snapshot empty() {
            return new Snapshot("", "", "", "", "", "", "", 5000, 10000, 100, false);
        }

        private static Snapshot from(Map<String, Object> properties) {
            String server = requireString(properties, "efficy.server");
            String appContext = requireString(properties, "efficy.appcontext");
            String version = requireString(properties, "efficy.version");
            String token = requireString(properties, "efficy.token");
            String advancedResource = requireString(properties, "efficy.advanced_resource");
            String baseResource = requireString(properties, "efficy.base_resource");
            String serviceResource = requireString(properties, "efficy.service_resource");

            return new Snapshot(
                    server,
                    appContext,
                    version,
                    token,
                    advancedResource,
                    baseResource,
                    serviceResource,
                    readPositiveInt(properties, "efficy.connect_timeout_ms", 5000),
                    readPositiveInt(properties, "efficy.read_timeout_ms", 10000),
                    readPositiveInt(properties, "efficy.max_page_size", 100),
                    readBoolean(properties, "efficy.forward_client_authorization", false)
            );
        }

        private static String requireString(Map<String, Object> properties, String key) {
            String value = readString(properties, key);
            if (value == null || value.isEmpty()) {
                throw new IllegalStateException("Missing required configuration: " + key);
            }

            return value;
        }

        private static String readString(Map<String, Object> properties, String key) {
            Object value = properties.get(key);
            if (value == null) {
                return null;
            }

            return String.valueOf(value).trim();
        }

        private static int readPositiveInt(Map<String, Object> properties, String key, int defaultValue) {
            String raw = readString(properties, key);
            if (raw == null || raw.isEmpty()) {
                return defaultValue;
            }

            try {
                int parsed = Integer.parseInt(raw);
                return parsed > 0 ? parsed : defaultValue;
            } catch (NumberFormatException ex) {
                return defaultValue;
            }
        }

        private static boolean readBoolean(Map<String, Object> properties, String key, boolean defaultValue) {
            String raw = readString(properties, key);
            if (raw == null || raw.isEmpty()) {
                return defaultValue;
            }

            return Boolean.parseBoolean(raw);
        }
    }
}
