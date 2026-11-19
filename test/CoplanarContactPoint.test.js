import { BufferGeometry, BufferAttribute, Vector3, Matrix4, Ray } from 'three';
import { MeshBVH, ExtendedTriangle, getTriangleHitPointInfo } from 'three-mesh-bvh';

// Builds an indexed geometry from an array of triangles, each described by three corner points.
function trianglesToGeometry( triangles ) {

	const positions = new Float32Array( triangles.length * 9 );
	triangles.forEach( ( triangle, i ) => {

		triangle.forEach( ( point, j ) => {

			positions.set( point, i * 9 + j * 3 );

		} );

	} );

	const geometry = new BufferGeometry();
	geometry.setAttribute( 'position', new BufferAttribute( positions, 3 ) );
	geometry.setIndex( Array.from( { length: triangles.length * 3 }, ( _, i ) => i ) );
	return geometry;

}

function triangleFromPoints( points ) {

	return new ExtendedTriangle(
		new Vector3().fromArray( points[ 0 ] ),
		new Vector3().fromArray( points[ 1 ] ),
		new Vector3().fromArray( points[ 2 ] ),
	);

}

function isPointOnTriangle( point, triangle, epsilon = 1e-6 ) {

	const closest = new Vector3();
	triangle.closestPointToPoint( point, closest );
	return point.distanceTo( closest ) <= epsilon;

}

describe( 'Coplanar contact points', () => {

	const firstPanel = [[ 0, 0, 2 ], [ 4, 0, 2 ], [ 0, 4, 2 ]];
	const secondPanel = [[ 1, 1, 2 ], [ 3, 1, 2 ], [ 1, 3, 2 ]];

	it( 'should report a contact point inside the shared region of coplanar triangles', () => {

		const tri1 = triangleFromPoints( firstPanel );
		const tri2 = triangleFromPoints( secondPanel );
		const target1 = new Vector3();
		const target2 = new Vector3();

		expect( tri1.distanceToTriangle( tri2, target1, target2 ) ).toBe( 0 );
		expect( target1.distanceTo( target2 ) ).toBe( 0 );

		expect( isPointOnTriangle( target1, tri1 ) ).toBe( true );
		expect( isPointOnTriangle( target1, tri2 ) ).toBe( true );

	} );

	it( 'should not change the zero-length intersection segment for coplanar triangles', () => {

		const tri1 = triangleFromPoints( firstPanel );
		const tri2 = triangleFromPoints( secondPanel );
		const line = { start: new Vector3( 1, 1, 1 ), end: new Vector3( 1, 1, 1 ) };

		expect( tri1.intersectsTriangle( tri2, line ) ).toBe( true );
		expect( line.start.distanceTo( new Vector3() ) ).toBe( 0 );
		expect( line.end.distanceTo( new Vector3() ) ).toBe( 0 );

	} );

	it.each( [ false, true ] )( 'should match the triangle result through the bvh with an other tree (indirect: %s)', indirect => {

		const geometry = trianglesToGeometry( [ firstPanel ] );
		const otherGeometry = trianglesToGeometry( [ secondPanel ] );
		otherGeometry.boundsTree = new MeshBVH( otherGeometry, { indirect } );

		const bvh = new MeshBVH( geometry, { indirect } );
		const target1 = {};
		const target2 = {};
		bvh.closestPointToGeometry( otherGeometry, new Matrix4(), target1, target2 );

		const tri1 = triangleFromPoints( firstPanel );
		const tri2 = triangleFromPoints( secondPanel );
		const triTarget1 = new Vector3();
		const triTarget2 = new Vector3();
		tri1.distanceToTriangle( tri2, triTarget1, triTarget2 );

		expect( target1.distance ).toBe( 0 );
		expect( target1.point.distanceTo( target2.point ) ).toBe( 0 );
		expect( target1.point.distanceTo( triTarget1 ) ).toBeCloseTo( 0 );
		expect( target2.point.distanceTo( triTarget2 ) ).toBeCloseTo( 0 );

		expect( isPointOnTriangle( target1.point, tri1 ) ).toBe( true );
		expect( isPointOnTriangle( target2.point, tri2 ) ).toBe( true );

		// the reported face indices should point at the geometric triangles
		const info1 = getTriangleHitPointInfo( target1.point, geometry, target1.faceIndex );
		const info2 = getTriangleHitPointInfo( target2.point, otherGeometry, target2.faceIndex );
		expect( Math.abs( info1.barycoord.x + info1.barycoord.y + info1.barycoord.z - 1 ) ).toBeLessThan( 1e-6 );
		expect( Math.min( info1.barycoord.x, info1.barycoord.y, info1.barycoord.z ) ).toBeGreaterThanOrEqual( - 1e-6 );
		expect( Math.abs( info2.barycoord.x + info2.barycoord.y + info2.barycoord.z - 1 ) ).toBeLessThan( 1e-6 );
		expect( Math.min( info2.barycoord.x, info2.barycoord.y, info2.barycoord.z ) ).toBeGreaterThanOrEqual( - 1e-6 );

	} );

	it.each( [ false, true ] )( 'should match the triangle result through the bvh without an other tree (indirect: %s)', indirect => {

		const geometry = trianglesToGeometry( [ firstPanel ] );
		const otherGeometry = trianglesToGeometry( [ secondPanel ] );

		const bvh = new MeshBVH( geometry, { indirect } );
		const target1 = {};
		const target2 = {};
		bvh.closestPointToGeometry( otherGeometry, new Matrix4(), target1, target2 );

		const tri1 = triangleFromPoints( firstPanel );
		const tri2 = triangleFromPoints( secondPanel );
		const triTarget1 = new Vector3();
		const triTarget2 = new Vector3();
		tri1.distanceToTriangle( tri2, triTarget1, triTarget2 );

		expect( target1.distance ).toBe( 0 );
		expect( target1.point.distanceTo( target2.point ) ).toBe( 0 );
		expect( target1.point.distanceTo( triTarget1 ) ).toBeCloseTo( 0 );
		expect( target2.point.distanceTo( triTarget2 ) ).toBeCloseTo( 0 );
		expect( isPointOnTriangle( target1.point, tri1 ) ).toBe( true );
		expect( isPointOnTriangle( target2.point, tri2 ) ).toBe( true );

	} );

	it( 'should not report separated coplanar triangles as touching', () => {

		const tri1 = triangleFromPoints( firstPanel );
		const tri2 = triangleFromPoints( [[ 10, 10, 2 ], [ 12, 10, 2 ], [ 10, 12, 2 ]] );
		const target1 = new Vector3();
		const target2 = new Vector3();

		const distance = tri1.distanceToTriangle( tri2, target1, target2 );
		expect( distance ).toBeCloseTo( 11.313708, 5 );
		expect( target1.distanceTo( new Vector3( 2, 2, 2 ) ) ).toBeCloseTo( 0 );
		expect( target2.distanceTo( new Vector3( 10, 10, 2 ) ) ).toBeCloseTo( 0 );

	} );

	it( 'should keep the non-coplanar contact point', () => {

		const tri1 = triangleFromPoints( firstPanel );
		const tri2 = triangleFromPoints( [[ 1, 1, 1 ], [ 3, 1, 1 ], [ 1, 1, 3 ]] );
		const target1 = new Vector3();
		const target2 = new Vector3();

		expect( tri1.distanceToTriangle( tri2, target1, target2 ) ).toBe( 0 );
		expect( target1.distanceTo( new Vector3( 1.5, 1, 2 ) ) ).toBeCloseTo( 0 );
		expect( target2.distanceTo( new Vector3( 1.5, 1, 2 ) ) ).toBeCloseTo( 0 );

	} );

} );

describe( 'Face index consistency', () => {

	// 8 columns x 5 rows of unit panels, each panel is a single triangle.
	const panels = [];
	for ( let i = 0; i < 40; i ++ ) {

		const x = ( i % 8 ) * 3;
		const y = Math.floor( i / 8 ) * 3;
		const z = ( i % 3 ) * 0.2;
		panels.push( [[ x, y, z ], [ x + 1, y, z ], [ x, y + 1, z ]] );

	}

	const raisedPanel = [[ 9.2, 3.2, 1.4 ], [ 9.8, 3.2, 1.4 ], [ 9.2, 3.8, 1.4 ]];

	it.each( [ false, true ] )( 'should report the same face for raycast and closest queries (indirect: %s)', indirect => {

		const geometry = trianglesToGeometry( panels );
		const bvh = new MeshBVH( geometry, { indirect } );

		const ray = new Ray( new Vector3( 9.2, 3.2, 5 ), new Vector3( 0, 0, - 1 ) );
		const raycastHit = bvh.raycastFirst( ray );

		// the index buffer is only left untouched in indirect mode
		expect( raycastHit.faceIndex ).toBe( indirect ? 11 : 4 );
		expect( raycastHit.distance ).toBeCloseTo( 4.6 );
		expect( raycastHit.point.distanceTo( new Vector3( 9.2, 3.2, 0.4 ) ) ).toBeCloseTo( 0 );

		const otherGeometry = trianglesToGeometry( [ raisedPanel ] );
		const target1 = {};
		const target2 = {};
		bvh.closestPointToGeometry( otherGeometry, new Matrix4(), target1, target2 );

		expect( target1.faceIndex ).toBe( raycastHit.faceIndex );
		expect( target1.distance ).toBeCloseTo( 1 );
		expect( target1.point.distanceTo( new Vector3( 9.2, 3.2, 0.4 ) ) ).toBeCloseTo( 0 );
		expect( target2.point.distanceTo( new Vector3( 9.2, 3.2, 1.4 ) ) ).toBeCloseTo( 0 );

		const info = getTriangleHitPointInfo( target1.point, geometry, target1.faceIndex );
		const barycoord = info.barycoord;
		expect( barycoord.x ).toBeCloseTo( 0.6, 5 );
		expect( barycoord.y ).toBeCloseTo( 0.2, 5 );
		expect( barycoord.z ).toBeCloseTo( 0.2, 5 );

	} );

	it.each( [ false, true ] )( 'should report a valid barycentric coordinate from closestPointToGeometry (indirect: %s)', indirect => {

		const geometry = trianglesToGeometry( panels );
		const bvh = new MeshBVH( geometry, { indirect } );
		const otherGeometry = trianglesToGeometry( [ raisedPanel ] );
		const target1 = {};
		const target2 = {};
		bvh.closestPointToGeometry( otherGeometry, new Matrix4(), target1, target2 );

		const info = getTriangleHitPointInfo( target1.point, geometry, target1.faceIndex );
		const { x, y, z } = info.barycoord;
		expect( Math.min( x, y, z ) ).toBeGreaterThanOrEqual( - 1e-6 );
		expect( Math.abs( x + y + z - 1 ) ).toBeLessThan( 1e-6 );

	} );

	it.each( [ false, true ] )( 'should report the same face for raycast and closestPointToPoint (indirect: %s)', indirect => {

		const geometry = trianglesToGeometry( panels );
		const bvh = new MeshBVH( geometry, { indirect } );

		const ray = new Ray( new Vector3( 9.2, 3.2, 5 ), new Vector3( 0, 0, - 1 ) );
		const raycastHit = bvh.raycastFirst( ray );
		const closest = bvh.closestPointToPoint( new Vector3( 9.2, 3.2, 9 ), {}, 0, Infinity );

		expect( closest.faceIndex ).toBe( raycastHit.faceIndex );

	} );

} );
