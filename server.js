require("dotenv").config();

const express = require("express");
const path = require("path");

const app = express();

const PORT = 3000;
const TOKEN = process.env.ALERTS_TOKEN;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));


/* =========================================
   НАЛАШТУВАННЯ
========================================= */

const CACHE_TIME = 30000;

let cache = {
    data: null,
    updatedAt: 0
};


/* =========================================
   ОТРИМАННЯ ПУБЛІЧНИХ ДАНИХ
========================================= */

async function getAlerts() {

    if (
        cache.data &&
        Date.now() - cache.updatedAt < CACHE_TIME
    ) {
        return cache.data;
    }

    if (!TOKEN) {
        throw new Error(
            "ALERTS_TOKEN не знайдено у .env"
        );
    }

    const response = await fetch(
        "https://api.alerts.in.ua/v1/alerts/active.json",
        {
            headers: {
                Authorization: `Bearer ${TOKEN}`
            }
        }
    );

    if (!response.ok) {

        throw new Error(
            `alerts.in.ua HTTP ${response.status}`
        );

    }

    const data = await response.json();

    cache = {
        data: data,
        updatedAt: Date.now()
    };

    return data;
}


/* =========================================
   ВИЗНАЧЕННЯ ТИПУ ЗАГРОЗИ
========================================= */

function getThreatType(alert) {

    const threats = Array.isArray(alert.threats)
        ? alert.threats
        : [];


    /*
       Спочатку перевіряємо threats.
       Це найкращий варіант, якщо API
       передає конкретний тип загрози.
    */

    let hasUav = false;
    let hasMissile = false;


    for (const threat of threats) {

        const type = String(
            threat.threat_type ||
            threat.type ||
            threat.name ||
            ""
        ).toLowerCase();


        if (
            type.includes("uav") ||
            type.includes("drone") ||
            type.includes("дрон") ||
            type.includes("бпла")
        ) {
            hasUav = true;
        }


        if (
            type.includes("missile") ||
            type.includes("rocket") ||
            type.includes("ракет")
        ) {
            hasMissile = true;
        }

    }


    /*
       Якщо threats містить ракету —
       це ракетна загроза.
    */

    if (hasMissile) {
        return "missile";
    }


    /*
       Якщо threats містить БпЛА —
       це загроза БпЛА.
    */

    if (hasUav) {
        return "uav";
    }


    /*
       Якщо threats порожній,
       НЕ будемо називати артилерію
       ракетою.
    */

    const alertType = String(
        alert.alert_type || ""
    ).toLowerCase();


    /*
       Повітряна тривога сама по собі
       НЕ означає ракету або БпЛА.
    */

    if (
        alertType === "air_raid" ||
        alertType.includes("air_raid")
    ) {
        return "air_raid";
    }


    /*
       Артилерійський обстріл окремо.
    */

    if (
        alertType === "artillery_shelling" ||
        alertType.includes("artillery")
    ) {
        return "artillery";
    }


    /*
       Інші типи.
    */

    if (
        alertType === "urban_fights" ||
        alertType.includes("fight")
    ) {
        return "combat";
    }


    return "other";
}


/* =========================================
   НАЗВА ТИПУ УКРАЇНСЬКОЮ
========================================= */

function getThreatTitle(type) {

    switch (type) {

        case "uav":
            return "БпЛА";

        case "missile":
            return "Ракетна загроза";

        case "air_raid":
            return "Повітряна тривога";

        case "artillery":
            return "Артилерійська загроза";

        case "combat":
            return "Бойові дії";

        default:
            return "Інше";

    }
}


/* =========================================
   ПРІОРИТЕТ ДЛЯ КАРТИ
========================================= */

function getVisualType(type) {

    /*
       На карту як окремі значки
       зараз виносимо тільки БпЛА
       та ракети.

       Інші типи залишаються
       регіональними попередженнями.
    */

    if (type === "uav") {
        return "uav";
    }

    if (type === "missile") {
        return "missile";
    }

    return "other";
}


/* =========================================
   НОРМАЛІЗАЦІЯ
========================================= */

function normalizeAlert(alert) {

    const type = getThreatType(alert);

    const visualType = getVisualType(type);


    return {

        id: alert.id || null,

        type: type,

        visual_type: visualType,

        title: getThreatTitle(type),

        location: {

            title:
                alert.location_title ||
                "Невідомий регіон",

            type:
                alert.location_type ||
                "unknown",

            oblast:
                alert.location_oblast ||
                null,

            raion:
                alert.location_raion ||
                null,

            uid:
                alert.location_uid ||
                null

        },

        alert_type:
            alert.alert_type ||
            null,

        level:
            alert.alert_level ||
            "unknown",

        started_at:
            alert.started_at ||
            null,

        updated_at:
            alert.updated_at ||
            null,

        finished_at:
            alert.finished_at ||
            null,

        notes:
            alert.notes ||
            null

    };
}


/* =========================================
   РЕГІОНАЛЬНИЙ МОНІТОРИНГ
========================================= */

function buildRegionalMonitoring(alerts) {

    const regions = {};


    for (const alert of alerts) {

        const normalized =
            normalizeAlert(alert);


        const region =
            normalized.location.oblast ||
            normalized.location.title;


        if (!region) {
            continue;
        }


        if (!regions[region]) {

            regions[region] = {

                region: region,

                uav: false,

                missile: false,

                air_raid: false,

                artillery: false,

                alerts: 0

            };

        }


        regions[region].alerts++;


        if (
            normalized.type === "uav"
        ) {
            regions[region].uav = true;
        }


        if (
            normalized.type === "missile"
        ) {
            regions[region].missile = true;
        }


        if (
            normalized.type === "air_raid"
        ) {
            regions[region].air_raid = true;
        }


        if (
            normalized.type === "artillery"
        ) {
            regions[region].artillery = true;
        }

    }


    return Object.values(regions);
}


/* =========================================
   СТАТИСТИКА
========================================= */

function buildStatistics(alerts) {

    const statistics = {

        total: alerts.length,

        uav: 0,

        missile: 0,

        air_raid: 0,

        artillery: 0,

        combat: 0,

        other: 0

    };


    for (const alert of alerts) {

        const type =
            getThreatType(alert);


        if (
            Object.prototype.hasOwnProperty.call(
                statistics,
                type
            )
        ) {

            statistics[type]++;

        }

        else {

            statistics.other++;

        }

    }


    return statistics;
}


/* =========================================
   HEALTH
========================================= */

app.get(
    "/api/health",
    (req, res) => {

        res.json({

            online: true,

            service:
                "Білоцерківський купол",

            monitoring:
                "regional-public",

            source:
                "alerts.in.ua",

            time:
                new Date().toISOString()

        });

    }
);


/* =========================================
   STATUS
========================================= */

app.get(
    "/api/status",
    async (req, res) => {

        try {

            const data =
                await getAlerts();


            res.json({

                api_connected: true,

                source:
                    "alerts.in.ua",

                updated_at:
                    new Date().toISOString(),

                alerts:
                    data.alerts || []

            });

        }

        catch (error) {

            console.error(
                "STATUS ERROR:",
                error.message
            );


            res.status(503).json({

                api_connected: false,

                source:
                    "alerts.in.ua",

                updated_at:
                    new Date().toISOString(),

                alerts: [],

                error:
                    "Не вдалося отримати публічні дані"

            });

        }

    }
);


/* =========================================
   ОСНОВНИЙ API
========================================= */

app.get(
    "/api/alerts",
    async (req, res) => {

        try {

            const data =
                await getAlerts();


            const rawAlerts =
                Array.isArray(data.alerts)
                    ? data.alerts
                    : [];


            const alerts =
                rawAlerts.map(
                    normalizeAlert
                );


            const regional =
                buildRegionalMonitoring(
                    rawAlerts
                );


            const statistics =
                buildStatistics(
                    rawAlerts
                );


            res.json({

                success: true,

                source:
                    "alerts.in.ua",

                updated_at:
                    new Date().toISOString(),

                count:
                    alerts.length,

                statistics:
                    statistics,

                regional:
                    regional,

                alerts:
                    alerts

            });

        }

        catch (error) {

            console.error(
                "ALERTS ERROR:",
                error.message
            );


            res.status(503).json({

                success: false,

                source:
                    "alerts.in.ua",

                updated_at:
                    new Date().toISOString(),

                count: 0,

                statistics: {

                    total: 0,

                    uav: 0,

                    missile: 0,

                    air_raid: 0,

                    artillery: 0,

                    combat: 0,

                    other: 0

                },

                regional: [],

                alerts: [],

                error:
                    "Не вдалося отримати публічні дані"

            });

        }

    }
);


/* =========================================
   ЗАПУСК
========================================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Радар запущено на порту ${PORT}`);
});
