package org.jahia.se.modules.efficy.service.model;

public enum EfficyResourceType {
    ADVANCED("advanced"),
    BASE("base"),
    SERVICE("service");

    private final String apiPathSegment;

    EfficyResourceType(String apiPathSegment) {
        this.apiPathSegment = apiPathSegment;
    }

    public String getApiPathSegment() {
        return apiPathSegment;
    }

    public static EfficyResourceType fromPathSegment(String value) {
        for (EfficyResourceType type : values()) {
            if (type.apiPathSegment.equalsIgnoreCase(value)) {
                return type;
            }
        }

        return null;
    }
}
