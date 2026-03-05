const express = require("express");
const seriesRoutes = require("express").Router();
const {
  addSeries,
  getSeries,
  updateSeries,
  hardDeleteSeries,
} = require("../controllers/series.controller");

seriesRoutes.post("/add-series", addSeries);
seriesRoutes.get("/get-series", getSeries); // supports ?brandId=
seriesRoutes.put("/update-series", updateSeries);
seriesRoutes.delete("/hard-delete-series/:id", hardDeleteSeries);

module.exports = seriesRoutes;
