require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();

const {
    EVE_CLIENT_ID,
    EVE_SECRET,
    EVE_CALLBACK,
    EVE_SCOPES
} = process.env;

const CORP_ID = 98769958;
const configPath = path.join(__dirname, 'data', 'config.json');

function initConfigFile() {
    if (!fs.existsSync(configPath)) {
        const defaultConfig = {
            ticketChannelId: "1325954514582503628",
            eventChannelId: "1325445036443304006",
            eventCreatorRoleIds: ["1307352064296489086", "1307352531445350480"],
            tokens: {},
            stations: []
        };
        fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    }
}

initConfigFile();

/**
 * 🔄 Refresh ESI access token
 */
async function refreshAccessToken(refresh_token) {
    const response = await axios.post('https://login.eveonline.com/v2/oauth/token',
        new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refresh_token
        }),
        {
            auth: {
                username: EVE_CLIENT_ID,
                password: EVE_SECRET
            },
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        }
    );

    return response.data;
}

/**
 * 🏢 Fetch corporation structures
 */
async function fetchCorporationStructures(access_token) {
    const response = await axios.get(`https://esi.evetech.net/latest/corporations/${CORP_ID}/structures/`, {
        headers: {
            Authorization: `Bearer ${access_token}`
        }
    });

    return response.data.map(structure => {
        const fuelTime = structure.fuel_expires
            ? Math.max(0, new Date(structure.fuel_expires) - new Date())
            : null;

        return {
            structure_id: structure.structure_id,
            name: structure.name,
            fuel_expires: structure.fuel_expires,
            fuel_remaining_ms: fuelTime
        };
    });
}

// 📥 Start login flow
app.get('/login', (req, res) => {
    const discordId = req.query.discord_id;

    if (!discordId) {
        return res.status(400).send('Missing Discord ID (state)');
    }

    const scopeString = encodeURIComponent(EVE_SCOPES.split(' ').join(' '));
    const authUrl = `https://login.eveonline.com/v2/oauth/authorize/?response_type=code&redirect_uri=${encodeURIComponent(EVE_CALLBACK)}&client_id=${EVE_CLIENT_ID}&scope=${scopeString}&state=${discordId}`;
    res.redirect(authUrl);
});

// 🎯 Callback from EVE SSO
app.get('/callback', async (req, res) => {
    const code = req.query.code;
    const discordId = req.query.state;

    if (!code || !discordId) {
        return res.status(400).send('Missing code or state (Discord ID)');
    }

    try {
        // Exchange code for tokens
        const tokenRes = await axios.post('https://login.eveonline.com/v2/oauth/token',
            new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: EVE_CALLBACK
            }),
            {
                auth: {
                    username: EVE_CLIENT_ID,
                    password: EVE_SECRET
                },
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

        const { access_token, refresh_token } = tokenRes.data;

        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

        // Save tokens under user's Discord ID
        if (!config.tokens) config.tokens = {};
        config.tokens[discordId] = {
            access_token,
            refresh_token
        };

        // Fetch structures
        const structures = await fetchCorporationStructures(access_token);

        // Save structure data (id, name, fuel remaining)
        config.stations = structures.map(s => ({
            id: s.structure_id,
            name: s.name,
            fuel_expires: s.fuel_expires,
            fuel_remaining_ms: s.fuel_remaining_ms
        }));

        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

        console.log(`Tokens and structures saved for Discord ID: ${discordId}`);
        res.send('Authorization and structure fetch successful. You may return to Discord.');
    } catch (err) {
        console.error('Error during callback:', err?.response?.data || err.message);
        res.status(500).send('Something went wrong during authorization.');
    }
});

app.listen(3000, () => {
    console.log('Auth server running at http://localhost:3000');
});

module.exports = {
    refreshAccessToken,
    fetchCorporationStructures
};
