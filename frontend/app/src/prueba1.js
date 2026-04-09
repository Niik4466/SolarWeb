const { Builder, By } = require('selenium-webdriver');
const assert = require('assert');

describe('HU-2U - Solicitar un registro', function () {
  this.timeout(30000);
  let driver;

  beforeEach(async () => {
    driver = await new Builder().forBrowser('chrome').build();
  });

  afterEach(async () => {
    if (driver) {
      await driver.quit();
    }
  });

  it('debería navegar a la vista de solicitar registro desde login', async () => {
    await driver.get('http://localhost:3002/login');

    await driver.sleep(2000);

    const urlAntes = await driver.getCurrentUrl();
    console.log('URL inicial:', urlAntes);

    const linkRegistro = await driver.findElement(
      By.css('a[href="/solicitar-registro"], a[href="#/solicitar-registro"], a[routerlink="/solicitar-registro"]')
    );

    await linkRegistro.click();

    await driver.sleep(2000);

    const urlDespues = await driver.getCurrentUrl();
    console.log('URL después del click:', urlDespues);

    assert.ok(urlDespues.includes('solicitar-registro'));
  });

  it('no debería permitir enviar el formulario vacío', async () => {
    await driver.get('http://localhost:3002/login');

    await driver.sleep(1500);

    const linkRegistro = await driver.findElement(
      By.css('a[href="/solicitar-registro"], a[href="#/solicitar-registro"], a[routerlink="/solicitar-registro"]')
    );
    await linkRegistro.click();

    await driver.sleep(1500);

    const urlAntes = await driver.getCurrentUrl();
    console.log('URL antes de enviar:', urlAntes);

    const botonEnviar = await driver.findElement(By.css('button[type="submit"]'));
    await botonEnviar.click();

    await driver.sleep(1500);

    const urlDespues = await driver.getCurrentUrl();
    console.log('URL después de enviar:', urlDespues);

    assert.ok(urlDespues.includes('/solicitar-registro'));
  });

    it('no debería permitir enviar si los correos no coinciden', async () => {
    await driver.get('http://localhost:3002/login');
    await driver.sleep(1500);

    const linkRegistro = await driver.findElement(
        By.css('a[href="/solicitar-registro"], a[href="#/solicitar-registro"], a[routerlink="/solicitar-registro"]')
    );
    await linkRegistro.click();

    await driver.sleep(1500);

    await driver.findElement(By.css('[formcontrolname="nombre"]')).sendKeys('Pepito');
    await driver.findElement(By.css('[formcontrolname="apellido"]')).sendKeys('Sanchez');
    await driver.findElement(By.css('[formcontrolname="email"]')).sendKeys('pepito@test.com');
    await driver.findElement(By.css('[formcontrolname="confirmEmail"]')).sendKeys('otro@test.com');
    await driver.findElement(By.css('[formcontrolname="password"]')).sendKeys('Clave1234');
    await driver.findElement(By.css('[formcontrolname="confirmPassword"]')).sendKeys('Clave1234');
    await driver.findElement(By.css('[formcontrolname="motivo"]')).sendKeys(
        'Quiero solicitar acceso al sistema para revisar información del proyecto, analizar datos disponibles y apoyar actividades relacionadas con el uso de la plataforma en el contexto académico.'
    );

    const botonEnviar = await driver.findElement(By.css('button[type="submit"]'));
    await botonEnviar.click();

    await driver.sleep(1500);

    const urlDespues = await driver.getCurrentUrl();
    console.log('URL después de enviar correos distintos:', urlDespues);

    assert.ok(urlDespues.includes('/solicitar-registro'));
    });
});