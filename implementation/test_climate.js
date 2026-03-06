const climateService = require('./backend/services/climateService');

setTimeout(() => {
    console.log(climateService.getClimateInfo('13', '071')); // Ciudad Real, Puertollano (for example)
    console.log(climateService.getClimateInfo('28', '079')); // Madrid
}, 1000);
